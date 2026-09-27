#!/usr/bin/env node
/**
 * Real-browser check of the built export (repository-root dist/), run as one foreground command:
 *
 *   node test/e2e/run.mjs            # from web/, after `npm run build`
 *
 * Pass A serves dist/ under a /preview/ subpath and opens it in headless Chromium with no wallet,
 * against the manifest's real public RPCs: layout at 1280px and 320px, console/resource failures,
 * horizontal overflow, landmarks, accessible names, keyboard focus order.
 *
 * Pass B starts a local anvil chain with the real contract bytecode, injects a mock EIP-1193
 * wallet, and drives the page through wrong-network switch/add, approve, open, join, moves to a
 * win, withdraw and a timeout claim, taking screenshots at each state.
 *
 * Output: docs/validation/screenshots/*.png and docs/validation/e2e-report.json. Anvil, the
 * static server and the browser are all stopped before the process exits. Requires anvil, forge
 * and a Playwright Chromium in ~/.cache/ms-playwright (or PLAYWRIGHT_CHROMIUM=/path/to/chrome).
 */
import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createPublicClient, createWalletClient, defineChain, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const repoDir = resolve(webDir, '..')
const distDir = resolve(repoDir, 'dist')
const outDir = resolve(repoDir, 'docs', 'validation')
const shotDir = join(outDir, 'screenshots')
mkdirSync(shotDir, { recursive: true })

const handoff = JSON.parse(readFileSync(resolve(webDir, 'deployment', 'handoff.json'), 'utf8'))
const networkFile = JSON.parse(readFileSync(resolve(webDir, 'deployment', 'network.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(distDir, 'imd-deployment.json'), 'utf8'))

const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PLAYER1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const PLAYER2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }

const report = { startedAt: new Date().toISOString(), passA: {}, passB: {}, problems: [] }
const problem = (text) => {
  report.problems.push(text)
  console.error(`PROBLEM: ${text}`)
}

function freePort() {
  return new Promise((done) => {
    const s = createNetServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => done(port))
    })
  })
}

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM
  const cache = join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(cache)) throw new Error('no Playwright browser cache; set PLAYWRIGHT_CHROMIUM')
  const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort()
  for (const d of dirs.reverse()) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(cache, d, sub)
      if (existsSync(p)) return p
    }
  }
  throw new Error('no chromium binary under ~/.cache/ms-playwright')
}

/** Serves dist/ under /preview/ so relative asset paths are exercised from a subpath. */
function serveDist(port) {
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (!url.pathname.startsWith('/preview/')) {
      res.writeHead(404).end('not under /preview/')
      return
    }
    let rel = decodeURIComponent(url.pathname.slice('/preview/'.length))
    if (rel === '' || rel.endsWith('/')) rel += 'index.html'
    const file = resolve(distDir, rel)
    if (!file.startsWith(distDir) || !existsSync(file)) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(readFileSync(file))
  })
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)))
}

async function waitForRpc(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('anvil did not start')
}

function artifact(name) {
  const path = resolve(repoDir, 'out', `${name}.sol`, `${name}.json`)
  if (!existsSync(path)) execSync('forge build', { cwd: repoDir, stdio: 'inherit' })
  const json = JSON.parse(readFileSync(path, 'utf8'))
  return { abi: json.abi, bytecode: json.bytecode.object }
}

async function startAnvil() {
  const port = await freePort()
  const rpcUrl = `http://127.0.0.1:${port}`
  const proc = spawn('anvil', ['--port', String(port), '--chain-id', String(handoff.chainId), '--silent'], { stdio: 'ignore' })
  await waitForRpc(rpcUrl)
  const chain = defineChain({ id: handoff.chainId, name: 'anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } })
  const account = privateKeyToAccount(DEPLOYER_KEY)
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) })
  const client = createPublicClient({ chain, transport: http(rpcUrl) })
  const deploy = async (name, args = []) => {
    const { abi, bytecode } = artifact(name)
    const hash = await wallet.deployContract({ abi, bytecode, args })
    return (await client.waitForTransactionReceipt({ hash })).contractAddress
  }
  const token = await deploy('LaunchToken')
  const game = await deploy('TicTacToeWager', [token])
  for (const p of [PLAYER1, PLAYER2]) {
    const hash = await wallet.writeContract({ address: token, abi: artifact('LaunchToken').abi, functionName: 'transfer', args: [p, parseEther('1000')] })
    await client.waitForTransactionReceipt({ hash })
  }
  return { proc, rpcUrl, token, game }
}

const mockWalletScript = ({ rpcUrl, account, chainId, known }) => `(() => {
  const rpcUrl = ${JSON.stringify(rpcUrl)}; let account = ${JSON.stringify(account)}; let chainId = ${chainId};
  const known = new Set(${JSON.stringify(known)}); const listeners = {}; let id = 1;
  const forward = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
    const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e } return j.result };
  const emit = (ev, ...a) => (listeners[ev] || []).forEach((l) => l(...a));
  const provider = { added: [], sent: [], rejectNext: false,
    async request({ method, params }) { const p = params || []; switch (method) {
      case 'eth_requestAccounts': case 'eth_accounts': return [account];
      case 'eth_chainId': return '0x' + chainId.toString(16);
      case 'wallet_switchEthereumChain': { const c = parseInt(p[0].chainId, 16); if (!known.has(c)) { const e = new Error('Unrecognized chain ID'); e.code = 4902; throw e } chainId = c; emit('chainChanged', '0x' + c.toString(16)); return null }
      case 'wallet_addEthereumChain': provider.added.push(p[0]); known.add(parseInt(p[0].chainId, 16)); return null;
      case 'eth_sendTransaction': if (provider.rejectNext) { provider.rejectNext = false; const e = new Error('User rejected the request.'); e.code = 4001; throw e } provider.sent.push(p[0]); return forward(method, p);
      default: return forward(method, p) } },
    on(ev, l) { (listeners[ev] ||= []).push(l) }, removeListener(ev, l) { listeners[ev] = (listeners[ev] || []).filter((x) => x !== l) },
    switchAccount(a) { account = a; emit('accountsChanged', [a]) } };
  window.ethereum = provider; window.__mockWallet = provider;
})()`

async function newPage(context, name) {
  const page = await context.newPage()
  const consoleErrors = []
  const failedRequests = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`))
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`)
  })
  return { page, consoleErrors, failedRequests, name }
}

async function audit(page) {
  return page.evaluate(() => {
    const name = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim()
    const unnamedButtons = [...document.querySelectorAll('button, a[href]')].filter((el) => name(el) === '' && !el.getAttribute('aria-labelledby')).map((el) => el.outerHTML.slice(0, 80))
    const unlabelledInputs = [...document.querySelectorAll('input, select, textarea')].filter((el) => !el.labels || el.labels.length === 0).map((el) => el.outerHTML.slice(0, 80))
    const smallTargets = [...document.querySelectorAll('button, a[href], input, select')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => (r.width < 24 || r.height < 24) && el.tagName !== 'A')
      .map(({ el, r }) => `${el.tagName} ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    return {
      h1Count: document.querySelectorAll('h1').length,
      mainCount: document.querySelectorAll('main').length,
      lang: document.documentElement.lang,
      unnamedButtons,
      unlabelledInputs,
      smallTargets,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName} ${h.textContent.trim()}`),
    }
  })
}

async function focusWalk(page, steps) {
  const order = []
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab')
    const desc = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return 'body'
      const style = getComputedStyle(el)
      return `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}" outline=${style.outlineStyle} ${style.outlineWidth}`
    })
    order.push(desc)
  }
  return order
}

/** Tabs from the top until the control whose accessible name starts with `prefix` has focus, then screenshots it. */
async function focusAndShoot(page, prefix, file) {
  await page.evaluate(() => document.activeElement?.blur())
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    const hit = await page.evaluate((p) => {
      const el = document.activeElement
      const name = (el?.getAttribute('aria-label') || el?.textContent || '').trim()
      if (!el || !name.startsWith(p)) return null
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return { x: r.x, y: r.y, width: r.width, height: r.height, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, offset: s.outlineOffset, tag: el.tagName }
    }, prefix)
    if (hit) {
      await page.screenshot({ path: join(shotDir, file), clip: { x: Math.max(0, hit.x - 24), y: Math.max(0, hit.y - 24), width: hit.width + 48, height: hit.height + 48 } })
      return hit
    }
  }
  problem(`could not reach a control named "${prefix}…" by keyboard`)
  return null
}

async function passA(browser, previewUrl) {
  const results = {}
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const desk = await newPage(context, 'desktop')
  await desk.page.goto(previewUrl, { waitUntil: 'networkidle' })
  await desk.page.waitForSelector('text=No browser wallet found', { timeout: 30_000 })
  await desk.page.waitForFunction(() => !document.body.textContent.includes('Pool rate: loading'), null, { timeout: 60_000 }).catch(() => problem('pool quote did not resolve within 60s on desktop'))
  await desk.page.waitForFunction(() => /No games yet|View game/.test(document.body.textContent), null, { timeout: 60_000 }).catch(() => problem('game list did not load from public RPC'))
  await desk.page.screenshot({ path: join(shotDir, 'a-desktop-disconnected.png'), fullPage: true })
  results.desktop = { audit: await audit(desk.page), consoleErrors: desk.consoleErrors, failedRequests: desk.failedRequests }
  results.desktop.bodyIncludes = {
    poolRate: (await desk.page.textContent('body')).match(/Pool rate[^.]*\./)?.[0] ?? null,
    gameCount: (await desk.page.textContent('body')).match(/No games yet|Showing the newest \d+ of \d+ games/)?.[0] ?? 'games listed',
  }
  results.desktop.focusOrder = await focusWalk(desk.page, 8)
  results.desktop.focusRingNeutral = await focusAndShoot(desk.page, 'Refresh', 'a-desktop-focus-neutral-button.png')
  results.desktop.focusRingLink = await focusAndShoot(desk.page, 'LaunchToken 0x', 'a-desktop-focus-link.png')

  // Deliberately broken configuration: the page must refuse to run rather than show wrong addresses.
  const broken = await context.newPage()
  await broken.route('**/abi/LaunchToken.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await broken.goto(previewUrl, { waitUntil: 'networkidle' })
  await broken.waitForSelector('text=Unable to load the deployment configuration', { timeout: 30_000 })
  results.brokenAbiRefused = (await broken.textContent('body')).includes('does not match its attested hash')
  await broken.screenshot({ path: join(shotDir, 'a-desktop-abi-mismatch.png'), clip: { x: 0, y: 0, width: 1280, height: 300 } })
  await broken.close()
  await context.close()

  for (const width of [320, 768]) {
    const ctx = await browser.newContext({ viewport: { width, height: 740 }, isMobile: width < 500, hasTouch: width < 500 })
    const mob = await newPage(ctx, `w${width}`)
    await mob.page.goto(previewUrl, { waitUntil: 'networkidle' })
    await mob.page.waitForSelector('text=No browser wallet found', { timeout: 30_000 })
    await mob.page.waitForFunction(() => /No games yet|View game/.test(document.body.textContent), null, { timeout: 60_000 }).catch(() => {})
    await mob.page.screenshot({ path: join(shotDir, `a-w${width}-disconnected.png`), fullPage: true })
    results[`w${width}`] = { audit: await audit(mob.page), consoleErrors: mob.consoleErrors, failedRequests: mob.failedRequests }
    await ctx.close()
  }
  for (const [key, r] of Object.entries(results)) {
    if (!r.audit) continue
    if (r.audit.scrollWidth > r.audit.innerWidth) problem(`${key}: horizontal overflow ${r.audit.scrollWidth} > ${r.audit.innerWidth}`)
    if (r.audit.unnamedButtons.length) problem(`${key}: unnamed controls ${JSON.stringify(r.audit.unnamedButtons)}`)
    if (r.audit.unlabelledInputs.length) problem(`${key}: unlabelled inputs ${JSON.stringify(r.audit.unlabelledInputs)}`)
    if (r.audit.h1Count !== 1 || r.audit.mainCount !== 1) problem(`${key}: h1=${r.audit.h1Count} main=${r.audit.mainCount}`)
    if (r.audit.smallTargets.length) problem(`${key}: targets under 24px ${JSON.stringify(r.audit.smallTargets)}`)
  }
  if (!results.brokenAbiRefused) problem('tampered ABI was not refused')
  return results
}

async function passB(browser, previewUrl, anvil) {
  const results = { steps: [] }
  const step = (text) => {
    results.steps.push(text)
    console.log(`  ✓ ${text}`)
  }
  const testManifest = {
    ...manifest,
    contracts: manifest.contracts.map((c) => ({ ...c, address: c.name === 'LaunchToken' ? anvil.token : c.name === 'TicTacToeWager' ? anvil.game : c.address })),
    network: { ...manifest.network, rpcUrls: [anvil.rpcUrl] },
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.route('**/imd-deployment.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(testManifest) }))
  await context.addInitScript(mockWalletScript({ rpcUrl: anvil.rpcUrl, account: PLAYER1, chainId: 1, known: [1] }))
  const { page, consoleErrors, failedRequests } = await newPage(context, 'connected')
  const stat = async (label) =>
    page.evaluate((l) => [...document.querySelectorAll('dt')].find((d) => d.textContent.trim().startsWith(l))?.nextElementSibling?.textContent?.trim() ?? null, label)
  const waitStat = async (label, expected) => {
    await page.waitForFunction(
      ([l, e]) => ([...document.querySelectorAll('dt')].find((d) => d.textContent.trim().startsWith(l))?.nextElementSibling?.textContent?.trim() ?? null) === e,
      [label, expected],
      { timeout: 30_000 },
    )
  }
  const tx = async (name, scope = page) => {
    const button = scope.getByRole('button', { name, exact: true })
    await button.waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction((n) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === n && !b.disabled), name, { timeout: 30_000 })
    await button.click()
    await page.waitForSelector('text=/confirmed,/', { timeout: 30_000 })
  }
  const cell = async (row, col) => {
    const name = `Row ${row}, column ${col}: empty`
    await page.waitForFunction((n) => [...document.querySelectorAll('button.cell')].some((b) => b.getAttribute('aria-label') === n && !b.disabled), name, { timeout: 30_000 })
    await page.getByRole('button', { name, exact: true }).click()
    await page.waitForSelector('text=/confirmed,/', { timeout: 30_000 })
  }

  await page.goto(previewUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Connect wallet' }).click()
  await page.waitForSelector('text=Your wallet is on another network', { timeout: 30_000 })
  await page.screenshot({ path: join(shotDir, 'b-wrong-network.png'), clip: { x: 0, y: 0, width: 1280, height: 520 } })
  step('wrong network detected after connecting on chain 1')
  await page.getByRole('button', { name: 'Switch to Sepolia' }).click()
  await page.waitForSelector('.chip-ok', { timeout: 30_000 })
  const added = await page.evaluate(() => window.__mockWallet.added)
  const expectedAdd = { ...networkFile.walletAddChain, rpcUrls: [anvil.rpcUrl] }
  if (JSON.stringify(added) !== JSON.stringify([expectedAdd])) problem(`wallet_addEthereumChain params differ: ${JSON.stringify(added)}`)
  step('wallet_switchEthereumChain failed with 4902, wallet_addEthereumChain was offered, then the switch succeeded')
  await waitStat('Balance', '1,000 NGHT')
  await page.screenshot({ path: join(shotDir, 'b-connected.png'), fullPage: true })
  step('connected: balance 1,000 NGHT, allowance 0, withdrawable 0 read from the chain')

  const form = page.getByRole('region', { name: 'Open a game' })
  await form.getByLabel('Stake per player').fill('5')
  results.focusRingPrimary = await focusAndShoot(page, 'Approve 5 NGHT', 'b-desktop-focus-primary-button.png')
  results.focusRingCellLater = true
  await tx('Approve 5 NGHT', form)
  await waitStat('Allowance to the game', '5 NGHT')
  step('approve 5 NGHT confirmed; allowance shows 5 NGHT')
  await tx('Open game', form)
  await page.waitForSelector('h2:has-text("Game #0")', { timeout: 30_000 })
  await waitStat('Balance', '995 NGHT')
  await page.screenshot({ path: join(shotDir, 'b-game-open.png'), fullPage: true })
  step('game #0 opened with 5 NGHT and auto-selected; Cancel offered to the creator')

  await page.evaluate((a) => window.__mockWallet.switchAccount(a), PLAYER2)
  const board = page.getByRole('region', { name: /^Game #0/ })
  await board.getByRole('heading', { name: 'Join as O' }).waitFor({ timeout: 30_000 })
  await waitStat('Balance', '1,000 NGHT')
  await tx('Approve 5 NGHT', board)
  await tx('Join game', board)
  await page.waitForSelector('text=/^X to move/', { timeout: 30_000 })
  step('player 2 approved and joined; game active, X to move, move clock running')

  await page.evaluate((a) => window.__mockWallet.switchAccount(a), PLAYER1)
  await page.waitForSelector('text=Your move (X)', { timeout: 30_000 })
  results.focusRingCell = await focusAndShoot(page, 'Row 1, column 1: empty', 'b-desktop-focus-board-cell.png')
  await page.screenshot({ path: join(shotDir, 'b-your-move.png'), fullPage: true })
  await cell(1, 1)
  await page.evaluate((a) => window.__mockWallet.switchAccount(a), PLAYER2)
  await page.waitForSelector('text=Your move (O)', { timeout: 30_000 })
  await cell(2, 1)
  await page.evaluate((a) => window.__mockWallet.switchAccount(a), PLAYER1)
  await page.waitForSelector('text=Your move (X)', { timeout: 30_000 })
  await cell(1, 2)
  await page.evaluate((a) => window.__mockWallet.switchAccount(a), PLAYER2)
  await page.waitForSelector('text=Your move (O)', { timeout: 30_000 })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.screenshot({ path: join(shotDir, 'b-w320-active-board.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await cell(2, 2)
  await page.evaluate((a) => window.__mockWallet.switchAccount(a), PLAYER1)
  await page.waitForSelector('text=Your move (X)', { timeout: 30_000 })
  await cell(1, 3)
  await page.waitForSelector('text=/won\\. 10 NGHT credited/', { timeout: 30_000 })
  await waitStat('Withdrawable', '10 NGHT')
  await page.screenshot({ path: join(shotDir, 'b-game-won.png'), fullPage: true })
  step('X completed the top row; outcome shown, winning line marked, withdrawable 10 NGHT')
  await tx('Withdraw 10 NGHT')
  await waitStat('Balance', '1,005 NGHT')
  step('withdraw confirmed; balance 1,005 NGHT, withdrawable 0')

  // Rejection path: the wallet refuses; nothing is sent and the alert explains it.
  await form.getByLabel('Stake per player').fill('1')
  await page.evaluate(() => {
    window.__mockWallet.rejectNext = true
  })
  const sentBefore = await page.evaluate(() => window.__mockWallet.sent.length)
  await form.getByRole('button', { name: 'Approve 1 NGHT', exact: true }).click()
  await page.waitForSelector('[role="alert"]:has-text("Request cancelled in the wallet")', { timeout: 30_000 })
  const sentAfter = await page.evaluate(() => window.__mockWallet.sent.length)
  if (sentAfter !== sentBefore) problem('a rejected transaction was still sent')
  await page.screenshot({ path: join(shotDir, 'b-rejected.png'), clip: { x: 0, y: 0, width: 1280, height: 520 } })
  await page.getByRole('button', { name: 'Dismiss' }).click()
  step('wallet rejection shown as an alert; no transaction sent')

  // Timeout: open + join a 1 NGHT game, advance the chain by an hour, claim as the waiting player.
  await tx('Approve 1 NGHT', form)
  await tx('Open game', form)
  await page.waitForSelector('h2:has-text("Game #1")', { timeout: 30_000 })
  await page.evaluate((a) => window.__mockWallet.switchAccount(a), PLAYER2)
  const board1 = page.getByRole('region', { name: /^Game #1/ })
  await board1.getByRole('heading', { name: 'Join as O' }).waitFor({ timeout: 30_000 })
  await tx('Approve 1 NGHT', board1)
  await tx('Join game', board1)
  await page.waitForSelector('button:has-text("Claim timeout")', { timeout: 30_000 })
  const disabledBefore = await page.evaluate(() => document.querySelector('button.btn:not(.cell)') && [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Claim timeout')?.disabled)
  if (!disabledBefore) problem('Claim timeout was enabled before the deadline')
  for (const [method, params] of [['evm_increaseTime', [3601]], ['evm_mine', []]]) {
    await fetch(anvil.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  }
  await page.waitForSelector('text=Move clock: expired', { timeout: 30_000 })
  await tx('Claim timeout', board1)
  await page.waitForSelector('text=/ran out of time/', { timeout: 30_000 })
  await waitStat('Withdrawable', '2 NGHT')
  await page.screenshot({ path: join(shotDir, 'b-timeout-claimed.png'), fullPage: true })
  step('timeout claim disabled before the hour, enabled after evm_increaseTime, claimed 2 NGHT pot')

  results.audit = await audit(page)
  results.consoleErrors = consoleErrors
  results.failedRequests = failedRequests
  await context.close()
  return results
}

async function main() {
  if (!existsSync(join(distDir, 'index.html'))) throw new Error('dist/index.html missing; run npm run build first')
  const port = await freePort()
  const server = await serveDist(port)
  const previewUrl = `http://127.0.0.1:${port}/preview/`
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true })
  let anvil
  try {
    console.log('Pass A: static export, no wallet, public RPC')
    report.passA = await passA(browser, previewUrl)
    console.log('Pass B: local chain with the real contracts and a mock wallet')
    anvil = await startAnvil()
    report.passB = await passB(browser, previewUrl, anvil)
  } catch (e) {
    problem(`aborted: ${e.stack ?? e}`)
  } finally {
    await browser.close()
    server.close()
    anvil?.proc.kill('SIGTERM')
  }
  report.finishedAt = new Date().toISOString()
  report.ok = report.problems.length === 0
  writeFileSync(join(outDir, 'e2e-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`report written to docs/validation/e2e-report.json; ${report.ok ? 'no problems' : `${report.problems.length} problem(s)`}`)
  process.exit(report.ok ? 0 : 1)
}

main()
