import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, http, parseEther, zeroAddress, type Abi, type Address } from 'viem'
import { describe, expect, inject, it } from 'vitest'
import { addChainParamsFrom, chainFrom, parseManifest, type NetworkInfo } from '../src/config'
import { canonicalJson, canonicalKeccak } from '../src/lib/canonical'
import { describeError, isUnknownChainError, isUserRejection } from '../src/lib/errors'
import { formatAmount, formatCountdown, parseAmount, shortAddress } from '../src/lib/format'
import { Mark, Status, decodeBoard, outcome, playerToMove, playerWaiting, winningLine, type GameRecord } from '../src/lib/game'
import { launchPoolKey } from '../src/lib/uniswap'
import { ensureChain, type Eip1193Provider } from '../src/lib/wallet'
import { abis, handoff, networkFile, readJson, repoDir, testManifest } from './helpers/fixtures'

describe('deployment manifest and ABI binding', () => {
  it('hashes the pinned ABIs to the handoff abiHash with canonical JSON keccak', () => {
    for (const c of handoff.contracts) {
      expect(canonicalKeccak(abis[c.name])).toBe(c.abiHash)
    }
  })

  it('canonicalises with sorted keys and no whitespace', () => {
    expect(canonicalJson({ b: [1, { d: null, c: 'x' }], a: true })).toBe('{"a":true,"b":[1,{"c":"x","d":null}]}')
  })

  it('derives wallet_addEthereumChain parameters equal to the handoff walletAddChain block', () => {
    expect(addChainParamsFrom(networkFile.network as unknown as NetworkInfo)).toEqual(networkFile.walletAddChain)
  })

  it('accepts the test manifest shape and rejects broken ones', () => {
    const manifest = testManifest(inject('anvil'))
    expect(parseManifest(manifest).chainId).toBe(handoff.chainId)
    expect(() => parseManifest({ ...manifest, version: 2 })).toThrow(/version/)
    expect(() => parseManifest({ ...manifest, network: { ...manifest.network, chainId: 1 } })).toThrow(/disagrees/)
    expect(() => parseManifest({ ...manifest, contracts: [{ ...manifest.contracts[0], abiPath: '../x.json' }] })).toThrow(/relative/)
    expect(() => parseManifest({ ...manifest, contracts: [{ ...manifest.contracts[0], address: 'nope' }] })).toThrow(/address/)
  })

  it('matches the committed export manifest when dist/ has been built', () => {
    const path = resolve(repoDir, 'dist', 'imd-deployment.json')
    if (!existsSync(path)) return
    const committed = readJson<Record<string, unknown>>(path)
    const parsed = parseManifest(committed)
    expect(parsed.launchId).toBe(handoff.launchId)
    expect(parsed.sourceCommit).toBe(handoff.sourceCommit)
    expect(parsed.attestationHash).toBe(handoff.attestationHash)
    expect(parsed.contracts.map((c) => [c.name, c.address, c.abiHash])).toEqual(handoff.contracts.map((c) => [c.name, c.address, c.abiHash]))
    expect(parsed.network).toEqual(networkFile.network)
    expect(parsed.assets.map((a) => a.path)).toContain('index.html')
    expect(parsed.assets.map((a) => a.path)).not.toContain('imd-deployment.json')
    for (const a of parsed.assets) expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
    const chain = chainFrom(parsed.network)
    expect(chain.id).toBe(parsed.chainId)
    expect(chain.rpcUrls.default.http).toEqual(parsed.network.rpcUrls)
  })
})

describe('game helpers', () => {
  const base: GameRecord = {
    id: 0n,
    playerX: '0x1111111111111111111111111111111111111111',
    stake: parseEther('1'),
    playerO: '0x2222222222222222222222222222222222222222',
    moveDeadline: 0,
    board: 0,
    status: Status.Finished,
    turn: Mark.X,
  }
  const pack = (cells: number[]) => cells.reduce((acc, c, i) => acc | (c << (i * 2)), 0)

  it('decodes the packed board and finds winning lines', () => {
    const cells = decodeBoard(pack([1, 1, 1, 2, 2, 0, 0, 0, 0]))
    expect(cells).toEqual([1, 1, 1, 2, 2, 0, 0, 0, 0])
    expect(winningLine(cells, Mark.X)).toEqual([0, 1, 2])
    expect(winningLine(cells, Mark.O)).toBeNull()
    expect(winningLine(decodeBoard(pack([2, 1, 1, 1, 2, 0, 0, 0, 2])), Mark.O)).toEqual([0, 4, 8])
  })

  it('reconstructs how a finished game ended', () => {
    expect(outcome({ ...base, board: pack([1, 1, 1, 2, 2, 0, 0, 0, 0]) })).toMatchObject({ kind: 'win', winner: base.playerX, line: [0, 1, 2] })
    expect(outcome({ ...base, board: pack([1, 2, 1, 1, 2, 2, 2, 1, 1]) })).toEqual({ kind: 'draw' })
    // No line, board not full: a timeout claimed against the player to move (X here).
    expect(outcome({ ...base, board: pack([1, 0, 0, 2, 0, 0, 0, 0, 0]), turn: Mark.X })).toEqual({ kind: 'timeout', winner: base.playerO, loser: base.playerX })
    expect(outcome({ ...base, status: Status.Active })).toEqual({ kind: 'none' })
  })

  it('knows who moves and who waits', () => {
    const active = { ...base, status: Status.Active, turn: Mark.O }
    expect(playerToMove(active)).toBe(base.playerO)
    expect(playerWaiting(active)).toBe(base.playerX)
    expect(playerToMove({ ...base, status: Status.Open, playerO: zeroAddress })).toBeNull()
  })
})

describe('formatting', () => {
  it('formats token amounts with grouping and trimmed decimals', () => {
    expect(formatAmount(parseEther('1000'), 18)).toBe('1,000')
    expect(formatAmount(parseEther('2.5'), 18)).toBe('2.5')
    expect(formatAmount(1n, 18)).toBe('<0.0001')
    expect(formatAmount(0n, 18)).toBe('0')
    expect(formatAmount(495993935775218591037513n, 18, 2)).toBe('495,993.93')
  })

  it('parses visitor input strictly', () => {
    expect(parseAmount('2.5', 18).value).toBe(parseEther('2.5'))
    expect(parseAmount(' 1,000 ', 18).value).toBe(parseEther('1000'))
    expect(parseAmount('', 18).error).toMatch(/Enter an amount/)
    expect(parseAmount('abc', 18).error).toMatch(/digits/)
    expect(parseAmount('1.' + '0'.repeat(19), 18).error).toMatch(/decimal places/)
  })

  it('formats countdowns and addresses', () => {
    expect(formatCountdown(3600)).toBe('1:00:00')
    expect(formatCountdown(65)).toBe('1:05')
    expect(formatCountdown(-5)).toBe('0:00')
    expect(shortAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe('0x7099…79C8')
  })
})

describe('wallet chain handling', () => {
  it('offers wallet_addEthereumChain after a 4902 switch failure, then switches again', async () => {
    const calls: { method: string; params?: unknown }[] = []
    let known = false
    const provider: Eip1193Provider = {
      async request({ method, params }) {
        calls.push({ method, params })
        if (method === 'wallet_switchEthereumChain' && !known) throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 })
        if (method === 'wallet_addEthereumChain') known = true
        return null
      },
    }
    const params = addChainParamsFrom(networkFile.network as unknown as NetworkInfo)
    await ensureChain(provider, handoff.chainId, params)
    expect(calls.map((c) => c.method)).toEqual(['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain'])
    expect(calls[1].params).toEqual([params])
    expect(calls[0].params).toEqual([{ chainId: '0xaa36a7' }])
  })

  it('does not add the chain when the switch fails for another reason', async () => {
    const provider: Eip1193Provider = {
      async request() {
        throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
      },
    }
    await expect(ensureChain(provider, handoff.chainId, addChainParamsFrom(networkFile.network as unknown as NetworkInfo))).rejects.toMatchObject({ code: 4001 })
    expect(isUserRejection({ code: 4001 })).toBe(true)
    expect(isUnknownChainError({ code: 4902 })).toBe(true)
    expect(isUnknownChainError({ data: { originalError: { code: 4902 } } })).toBe(true)
    expect(isUnknownChainError({ message: 'Unrecognized chain ID 0xaa36a7' })).toBe(true)
  })
})

describe('error copy', () => {
  it('turns a wallet rejection into a plain sentence', () => {
    expect(describeError({ code: 4001, message: 'User rejected' })).toBe('Request cancelled in the wallet. Nothing was sent.')
  })

  it('decodes a real contract revert into an instruction', async () => {
    const anvil = inject('anvil')
    const client = createPublicClient({ transport: http(anvil.rpcUrl) })
    const gameAbi = abis.TicTacToeWager as Abi
    // Game ids that do not exist revert with GameNotFound.
    const err = await client
      .simulateContract({ account: anvil.accounts[1] as Address, address: anvil.game, abi: gameAbi, functionName: 'join', args: [10_000n] })
      .catch((e: unknown) => e)
    expect(describeError(err)).toBe('That game id does not exist yet.')
    const low = await client
      .simulateContract({ account: anvil.accounts[1] as Address, address: anvil.game, abi: gameAbi, functionName: 'open', args: [1n] })
      .catch((e: unknown) => e)
    expect(describeError(low)).toBe('Stake at least 1 NGHT.')
  })
})

describe('uniswap pool key', () => {
  it('puts native ETH first and the token second, with the manifest fee and spacing', () => {
    const key = launchPoolKey('0xe0d98c90d2cb2507b36d1fd104f110a80a07d9dd')
    expect(key.currency0).toBe(zeroAddress)
    expect(key.currency1).toBe('0xe0d98c90d2cb2507b36d1fd104f110a80a07d9dd')
    expect(key.fee).toBe(3000)
    expect(key.tickSpacing).toBe(60)
    expect(key.hooks).toBe(zeroAddress)
  })
})
