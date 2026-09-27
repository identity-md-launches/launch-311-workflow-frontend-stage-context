// Builds and checks dist/imd-deployment.json, the app's runtime deployment configuration.
//
//   node scripts/manifest.ts prepare   -> public/abi/*.json + public/imd-deployment.json (dev server, assets: [])
//   node scripts/manifest.ts finalize  -> dist/imd-deployment.json with every exported file hashed
//   node scripts/manifest.ts verify    -> recompute everything and compare with the committed export
//
// Inputs: web/deployment/handoff.json and web/deployment/network.json (copies of the workflow
// handoff) and the implementation-derived ABIs at <repo>/docs/abi/<Contract>.json.
// Runs on Node 24 with built-in type stripping; no build step needed.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalKeccak } from '../src/lib/canonical.ts'

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(webDir, '..')
const distDir = resolve(repoDir, 'dist')
const publicDir = resolve(webDir, 'public')
const abiSourceDir = resolve(repoDir, 'docs', 'abi')
const handoffPath = resolve(webDir, 'deployment', 'handoff.json')
const networkPath = resolve(webDir, 'deployment', 'network.json')

const MANIFEST_NAME = 'imd-deployment.json'
const MAX_ASSETS = 128
const MAX_FILE_BYTES = 8 * 1024 * 1024
const EXPORT_BUDGET_BYTES = 24 * 1024 * 1024 // well below half of the checker's 64 MiB budget

interface HandoffContract {
  name: string
  address: string
  abiHash: string
}
interface Handoff {
  chainId: number
  launchId: string
  sourceCommit: string
  attestationHash: string
  contracts: HandoffContract[]
}
interface NetworkFile {
  network: Record<string, unknown> & { chainId: number; rpcUrls: string[]; name: string; explorer: string }
  walletAddChain: Record<string, unknown>
}
interface Asset {
  path: string
  sha256: string
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function loadInputs() {
  const handoff = readJson<Handoff>(handoffPath)
  const networkFile = readJson<NetworkFile>(networkPath)
  if (networkFile.network.chainId !== handoff.chainId) {
    throw new Error(`network.json chainId ${networkFile.network.chainId} != handoff chainId ${handoff.chainId}`)
  }
  const abis = handoff.contracts.map((c) => {
    const path = join(abiSourceDir, `${c.name}.json`)
    const bytes = readFileSync(path)
    const abi = JSON.parse(bytes.toString('utf8')) as unknown
    if (!Array.isArray(abi)) throw new Error(`${path} is not a raw ABI array`)
    const hash = canonicalKeccak(abi)
    if (hash !== c.abiHash) {
      throw new Error(`ABI hash mismatch for ${c.name}: computed ${hash}, handoff ${c.abiHash}`)
    }
    return { contract: c, bytes, abiPath: `abi/${c.name}.json` }
  })
  return { handoff, networkFile, abis }
}

function buildManifest(handoff: Handoff, network: NetworkFile['network'], assets: Asset[]) {
  // Key order matters for readers diffing against the documented schema.
  return {
    version: 1 as const,
    launchId: handoff.launchId,
    chainId: handoff.chainId,
    sourceCommit: handoff.sourceCommit,
    attestationHash: handoff.attestationHash,
    contracts: handoff.contracts.map((c) => ({
      name: c.name,
      address: c.address,
      abiHash: c.abiHash,
      abiPath: `abi/${c.name}.json`,
    })),
    assets,
    network,
  }
}

function walk(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

function hashExport(): Asset[] {
  if (!existsSync(distDir)) throw new Error(`missing ${distDir}; run vite build first`)
  const files = walk(distDir).filter((p) => p !== MANIFEST_NAME)
  if (!files.includes('index.html')) throw new Error('dist/index.html is missing')
  if (files.length > MAX_ASSETS) throw new Error(`${files.length} assets exceed the limit of ${MAX_ASSETS}`)
  let total = 0
  const assets = files.map((path) => {
    const bytes = readFileSync(join(distDir, path))
    if (bytes.length > MAX_FILE_BYTES) throw new Error(`${path} exceeds 8 MiB`)
    total += bytes.length
    return { path, sha256: sha256(bytes) }
  })
  if (total > EXPORT_BUDGET_BYTES) throw new Error(`export is ${total} bytes, above the ${EXPORT_BUDGET_BYTES} byte budget`)
  return assets
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function prepare() {
  const { handoff, networkFile, abis } = loadInputs()
  for (const { abiPath, bytes } of abis) {
    const target = join(publicDir, abiPath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  writeJson(join(publicDir, MANIFEST_NAME), buildManifest(handoff, networkFile.network, []))
  console.log(`prepared ${abis.length} ABI file(s) and ${MANIFEST_NAME} under web/public for the dev server`)
}

function finalize() {
  const { handoff, networkFile, abis } = loadInputs()
  // Vite copies public/ into dist/; make sure the ABIs there are byte-identical to the pinned export.
  for (const { abiPath, bytes } of abis) {
    const target = join(distDir, abiPath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  const assets = hashExport()
  writeJson(join(distDir, MANIFEST_NAME), buildManifest(handoff, networkFile.network, assets))
  const total = assets.reduce((n, a) => n + statSync(join(distDir, a.path)).size, 0)
  console.log(`wrote dist/${MANIFEST_NAME}: ${assets.length} assets, ${total} bytes`)
  for (const a of assets) console.log(`  ${a.sha256}  ${a.path}`)
}

function verify() {
  const { handoff, networkFile, abis } = loadInputs()
  const committed = readJson<ReturnType<typeof buildManifest>>(join(distDir, MANIFEST_NAME))
  const expected = buildManifest(handoff, networkFile.network, hashExport())
  const problems: string[] = []
  if (JSON.stringify(committed) !== JSON.stringify(expected)) {
    const a = JSON.stringify(committed, null, 2).split('\n')
    const b = JSON.stringify(expected, null, 2).split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) problems.push(`line ${i + 1}: committed ${a[i] ?? '<none>'} | expected ${b[i] ?? '<none>'}`)
    }
  }
  for (const { contract, abiPath } of abis) {
    const distAbi = JSON.parse(readFileSync(join(distDir, abiPath), 'utf8')) as unknown
    const hash = canonicalKeccak(distAbi)
    if (hash !== contract.abiHash) problems.push(`dist/${abiPath} hash ${hash} != ${contract.abiHash}`)
  }
  // The wallet_addEthereumChain parameters the app derives from `network` must equal the handoff's block.
  const derived = {
    chainId: `0x${networkFile.network.chainId.toString(16)}`,
    chainName: networkFile.network.name,
    rpcUrls: networkFile.network.rpcUrls,
    nativeCurrency: networkFile.network.nativeCurrency,
    blockExplorerUrls: [networkFile.network.explorer],
  }
  if (JSON.stringify(derived) !== JSON.stringify(networkFile.walletAddChain)) {
    problems.push(`derived walletAddChain ${JSON.stringify(derived)} != network.json ${JSON.stringify(networkFile.walletAddChain)}`)
  }
  if (problems.length > 0) {
    console.error(`manifest verification failed:\n${problems.map((p) => `  ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`dist/${MANIFEST_NAME} matches the export (${expected.assets.length} assets) and the handoff`)
}

const command = process.argv[2]
if (command === 'prepare') prepare()
else if (command === 'finalize') finalize()
else if (command === 'verify') verify()
else {
  console.error('usage: node scripts/manifest.ts <prepare|finalize|verify>')
  process.exit(2)
}
