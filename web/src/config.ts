/**
 * Central configuration.
 *
 * Contract addresses, the chain, public RPC URLs, the explorer and the Uniswap v4 addresses are
 * NOT hard-coded here: they are read at runtime from ./imd-deployment.json (the attested
 * deployment manifest emitted next to index.html) and the ABI files it points at. This module
 * holds the few build-time constants the page needs and the loader that turns the manifest into
 * typed configuration. There are no private credentials anywhere in the app.
 */
import { defineChain, type Abi, type Address, type Chain } from 'viem'
import { canonicalKeccak } from './lib/canonical'

/** Runtime deployment configuration, relative to index.html. */
export const DEPLOYMENT_MANIFEST_URL = './imd-deployment.json'

/** Contract names exactly as the handoff and manifest spell them. */
export const CONTRACT_NAMES = { token: 'LaunchToken', game: 'TicTacToeWager' } as const

/**
 * Launch pool parameters from the approved manifest (launch.json at the repository root):
 * NGHT pairs with native ETH (zero address), fee 3000, tick spacing 60, no hook. Only used to
 * quote the pool rate through the quoter named in the manifest's `network.uniswapV4` block.
 */
export const LAUNCH_POOL = {
  pairedCurrency: '0x0000000000000000000000000000000000000000' as Address,
  fee: 3000,
  tickSpacing: 60,
  hooks: '0x0000000000000000000000000000000000000000' as Address,
} as const

/** Sample input for the displayed pool rate: 0.01 ETH. */
export const QUOTE_SAMPLE_WEI = 10_000_000_000_000_000n

/** How often chain state is re-read while the page is open. */
export const DEFAULT_POLL_MS = 12_000

/** Newest games shown in the list. Older games stay reachable by id. */
export const GAME_LIST_LIMIT = 50

/** Optional. No WalletConnect project ID is configured; only injected browser wallets are offered. */
export const WALLETCONNECT_PROJECT_ID: string | undefined = undefined

export interface UniswapV4Addresses {
  poolManager: Address
  universalRouter: Address
  quoter: Address
  stateView: Address
  positionManager: Address
  permit2: Address
}

export interface NetworkInfo {
  chainId: number
  name: string
  testnet: boolean
  rpcUrls: string[]
  explorer: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  faucets: string[]
  uniswapV4: UniswapV4Addresses
}

export interface ManifestContract {
  name: string
  address: Address
  abiHash: string
  abiPath: string
}

export interface DeploymentManifest {
  version: 1
  launchId: string
  chainId: number
  sourceCommit: string
  attestationHash: string
  contracts: ManifestContract[]
  assets: { path: string; sha256: string }[]
  network: NetworkInfo
}

export interface AddEthereumChainParameter {
  chainId: `0x${string}`
  chainName: string
  rpcUrls: string[]
  nativeCurrency: { name: string; symbol: string; decimals: number }
  blockExplorerUrls: string[]
}

export interface ContractBinding {
  name: string
  address: Address
  abi: Abi
  abiHash: string
}

export interface Deployment {
  manifest: DeploymentManifest
  chainId: number
  chain: Chain
  network: NetworkInfo
  addChainParams: AddEthereumChainParameter
  token: ContractBinding
  game: ContractBinding
  contracts: ContractBinding[]
}

const HEX_64 = /^[0-9a-f]{64}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

function fail(message: string): never {
  throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Checks the shape of the manifest so a corrupted or foreign file never reaches the wallet. */
export function parseManifest(raw: unknown): DeploymentManifest {
  if (!isRecord(raw)) fail('deployment manifest is not an object')
  if (raw.version !== 1) fail(`unsupported deployment manifest version ${String(raw.version)}`)
  if (typeof raw.launchId !== 'string' || raw.launchId.length === 0) fail('manifest launchId missing')
  if (typeof raw.chainId !== 'number' || !Number.isInteger(raw.chainId) || raw.chainId <= 0) fail('manifest chainId invalid')
  if (typeof raw.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(raw.sourceCommit)) fail('manifest sourceCommit invalid')
  if (typeof raw.attestationHash !== 'string' || !HEX_64.test(raw.attestationHash)) fail('manifest attestationHash invalid')
  if (!Array.isArray(raw.contracts) || raw.contracts.length === 0) fail('manifest contracts missing')
  if (!Array.isArray(raw.assets)) fail('manifest assets missing')
  if (!isRecord(raw.network)) fail('manifest network block missing')
  const network = raw.network
  if (network.chainId !== raw.chainId) fail('manifest network.chainId disagrees with chainId')
  if (typeof network.name !== 'string') fail('network.name missing')
  if (!Array.isArray(network.rpcUrls) || network.rpcUrls.length === 0) fail('network.rpcUrls missing')
  if (typeof network.explorer !== 'string') fail('network.explorer missing')
  if (!isRecord(network.nativeCurrency)) fail('network.nativeCurrency missing')
  if (!isRecord(network.uniswapV4)) fail('network.uniswapV4 missing')
  for (const key of ['poolManager', 'universalRouter', 'quoter', 'stateView', 'positionManager', 'permit2']) {
    const value = network.uniswapV4[key]
    if (typeof value !== 'string' || !ADDRESS.test(value)) fail(`network.uniswapV4.${key} invalid`)
  }
  for (const c of raw.contracts) {
    if (!isRecord(c)) fail('manifest contract entry is not an object')
    if (typeof c.name !== 'string') fail('manifest contract name missing')
    if (typeof c.address !== 'string' || !ADDRESS.test(c.address)) fail(`address for ${c.name} invalid`)
    if (typeof c.abiHash !== 'string' || !HEX_64.test(c.abiHash)) fail(`abiHash for ${c.name} invalid`)
    if (typeof c.abiPath !== 'string' || c.abiPath.startsWith('/') || c.abiPath.includes('..') || c.abiPath.includes('://')) {
      fail(`abiPath for ${c.name} must be relative to the export`)
    }
  }
  return raw as unknown as DeploymentManifest
}

export function addChainParamsFrom(network: NetworkInfo): AddEthereumChainParameter {
  return {
    chainId: `0x${network.chainId.toString(16)}`,
    chainName: network.name,
    rpcUrls: network.rpcUrls,
    nativeCurrency: network.nativeCurrency,
    blockExplorerUrls: [network.explorer],
  }
}

export function chainFrom(network: NetworkInfo): Chain {
  return defineChain({
    id: network.chainId,
    name: network.name,
    testnet: network.testnet,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: network.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: network.explorer } },
  })
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url, { cache: 'no-cache' })
  if (!response.ok) fail(`${url}: HTTP ${response.status}`)
  return response.json()
}

/**
 * Loads ./imd-deployment.json and the ABIs it references, and verifies each ABI's canonical
 * keccak against the attested `abiHash` before any address is used.
 */
export async function loadDeployment(fetchImpl: typeof fetch = fetch, manifestUrl = DEPLOYMENT_MANIFEST_URL): Promise<Deployment> {
  const manifest = parseManifest(await fetchJson(fetchImpl, manifestUrl))
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1)
  const contracts: ContractBinding[] = await Promise.all(
    manifest.contracts.map(async (c) => {
      const abi = await fetchJson(fetchImpl, `${base}${c.abiPath}`)
      if (!Array.isArray(abi)) fail(`${c.abiPath} is not an ABI array`)
      const hash = canonicalKeccak(abi)
      if (hash !== c.abiHash) fail(`ABI for ${c.name} does not match its attested hash`)
      return { name: c.name, address: c.address, abi: abi as Abi, abiHash: c.abiHash }
    }),
  )
  const token = contracts.find((c) => c.name === CONTRACT_NAMES.token) ?? fail(`manifest has no ${CONTRACT_NAMES.token}`)
  const game = contracts.find((c) => c.name === CONTRACT_NAMES.game) ?? fail(`manifest has no ${CONTRACT_NAMES.game}`)
  return {
    manifest,
    chainId: manifest.chainId,
    chain: chainFrom(manifest.network),
    network: manifest.network,
    addChainParams: addChainParamsFrom(manifest.network),
    token,
    game,
    contracts,
  }
}
