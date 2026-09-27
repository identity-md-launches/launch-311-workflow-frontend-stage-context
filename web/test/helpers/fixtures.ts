import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { vi } from 'vitest'
import type { AnvilInfo } from '../global-setup'

export const repoDir = resolve(import.meta.dirname, '..', '..', '..')

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export interface HandoffFile {
  chainId: number
  launchId: string
  sourceCommit: string
  attestationHash: string
  contracts: { name: string; address: string; abiHash: string }[]
}
export interface NetworkFile {
  network: Record<string, unknown> & { chainId: number; rpcUrls: string[] }
  walletAddChain: Record<string, unknown>
}

export const handoff = readJson<HandoffFile>(resolve(repoDir, 'web', 'deployment', 'handoff.json'))
export const networkFile = readJson<NetworkFile>(resolve(repoDir, 'web', 'deployment', 'network.json'))
export const abis: Record<string, unknown[]> = Object.fromEntries(
  handoff.contracts.map((c) => [c.name, readJson<unknown[]>(resolve(repoDir, 'docs', 'abi', `${c.name}.json`))]),
)

/**
 * A manifest shaped exactly like dist/imd-deployment.json, with the handoff addresses replaced by
 * the local anvil deployment and the RPC list pointing at anvil.
 */
export function testManifest(anvil: AnvilInfo) {
  const addressFor: Record<string, string> = { LaunchToken: anvil.token, TicTacToeWager: anvil.game }
  return {
    version: 1,
    launchId: handoff.launchId,
    chainId: handoff.chainId,
    sourceCommit: handoff.sourceCommit,
    attestationHash: handoff.attestationHash,
    contracts: handoff.contracts.map((c) => ({ name: c.name, address: addressFor[c.name] ?? c.address, abiHash: c.abiHash, abiPath: `abi/${c.name}.json` })),
    assets: [],
    network: { ...networkFile.network, rpcUrls: [anvil.rpcUrl] },
  }
}

/** Serves ./imd-deployment.json and ./abi/*.json from memory; everything else hits the real fetch. */
export function stubManifestFetch(manifest: unknown) {
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.endsWith('imd-deployment.json')) return Promise.resolve(Response.json(manifest))
    const abiMatch = /abi\/([A-Za-z0-9_]+)\.json$/.exec(url)
    if (abiMatch && abis[abiMatch[1]]) return Promise.resolve(Response.json(abis[abiMatch[1]]))
    return realFetch(input, init)
  })
}

export async function rpc(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const json = (await res.json()) as { result?: unknown; error?: { message: string } }
  if (json.error) throw new Error(json.error.message)
  return json.result
}
