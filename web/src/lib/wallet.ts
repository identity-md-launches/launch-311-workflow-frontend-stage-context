import type { AddEthereumChainParameter } from '../config'
import { isUnknownChainError } from './errors'

/** The subset of EIP-1193 the page relies on. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
  on?(event: string, listener: (...args: never[]) => void): void
  removeListener?(event: string, listener: (...args: never[]) => void): void
}

export interface WalletInfo {
  /** EIP-6963 reverse-DNS id, or 'injected' for a bare window.ethereum. */
  id: string
  name: string
  icon?: string
  provider: Eip1193Provider
}

interface Eip6963AnnounceEvent extends Event {
  detail: { info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193Provider }
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { isMetaMask?: boolean; providers?: Eip1193Provider[] }
  }
}

/**
 * Discovers injected wallets through EIP-6963, falling back to window.ethereum. Calls `onChange`
 * with the current list whenever it grows. Returns an unsubscribe function.
 */
export function discoverWallets(onChange: (wallets: WalletInfo[]) => void): () => void {
  const found = new Map<string, WalletInfo>()
  const providers = new Set<Eip1193Provider>()
  const publish = () => onChange([...found.values()])

  const onAnnounce = (event: Event) => {
    const { info, provider } = (event as Eip6963AnnounceEvent).detail ?? {}
    if (!info || !provider || providers.has(provider)) return
    providers.add(provider)
    found.set(info.rdns || info.uuid, { id: info.rdns || info.uuid, name: info.name, icon: info.icon, provider })
    publish()
  }
  window.addEventListener('eip6963:announceProvider', onAnnounce)
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  // Wallets that only inject window.ethereum announce nothing; give them a moment, then add it.
  const timer = window.setTimeout(() => {
    const injected = window.ethereum
    if (injected && !providers.has(injected)) {
      providers.add(injected)
      found.set('injected', { id: 'injected', name: injected.isMetaMask ? 'MetaMask' : 'Browser wallet', provider: injected })
      publish()
    } else if (found.size === 0) {
      publish()
    }
  }, 300)

  return () => {
    window.removeEventListener('eip6963:announceProvider', onAnnounce)
    window.clearTimeout(timer)
  }
}

export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`
}

export function parseChainId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string') {
    const n = value.startsWith('0x') ? Number.parseInt(value, 16) : Number.parseInt(value, 10)
    return Number.isNaN(n) ? null : n
  }
  return null
}

/**
 * Asks the wallet to switch to the deployment chain. When the wallet does not know the chain
 * (code 4902 or an equivalent message) it is offered `wallet_addEthereumChain` with the
 * manifest-derived parameters, then asked to switch again.
 */
export async function ensureChain(provider: Eip1193Provider, chainId: number, addParams: AddEthereumChainParameter): Promise<void> {
  const params = [{ chainId: toHexChainId(chainId) }]
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params })
  } catch (error) {
    if (!isUnknownChainError(error)) throw error
    await provider.request({ method: 'wallet_addEthereumChain', params: [addParams] })
    await provider.request({ method: 'wallet_switchEthereumChain', params })
  }
}
