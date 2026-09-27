import type { Address } from 'viem'
import type { Eip1193Provider } from '../../src/lib/wallet'

type Listener = (...args: unknown[]) => void

export interface MockWallet extends Eip1193Provider {
  account: Address
  chainId: number
  knownChains: Set<number>
  /** Parameters passed to wallet_addEthereumChain, in order. */
  addedChains: unknown[]
  /** eth_sendTransaction payloads that were forwarded to the chain. */
  sent: Record<string, unknown>[]
  /** When true, the next eth_sendTransaction fails with EIP-1193 code 4001 (user rejected). */
  rejectNextSend: boolean
  switchAccount(account: Address): void
  setChain(chainId: number): void
}

interface Options {
  rpcUrl: string
  account: Address
  chainId: number
  /** Chains the wallet already knows; switching to any other chain fails with 4902 until it is added. */
  knownChains?: number[]
}

/**
 * An EIP-1193 provider standing in for a browser wallet. Account, chain and network-management
 * requests are answered locally; everything else (reads, eth_sendTransaction from anvil's
 * unlocked accounts) is forwarded to the local chain.
 */
export function createMockWallet({ rpcUrl, account, chainId, knownChains = [chainId] }: Options): MockWallet {
  const listeners = new Map<string, Set<Listener>>()
  let nextId = 1

  const forward = async (method: string, params: unknown[]): Promise<unknown> => {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    })
    const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } }
    if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data })
    return json.result
  }
  const emit = (event: string, ...args: unknown[]) => listeners.get(event)?.forEach((l) => l(...args))

  const wallet: MockWallet = {
    account,
    chainId,
    knownChains: new Set(knownChains),
    addedChains: [],
    sent: [],
    rejectNextSend: false,
    async request({ method, params }) {
      const p = (params ?? []) as Record<string, unknown>[]
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [wallet.account]
        case 'eth_chainId':
          return `0x${wallet.chainId.toString(16)}`
        case 'wallet_switchEthereumChain': {
          const id = Number.parseInt(String(p[0]?.chainId), 16)
          if (!wallet.knownChains.has(id)) throw Object.assign(new Error('Unrecognized chain ID. Try adding the chain first.'), { code: 4902 })
          wallet.setChain(id)
          return null
        }
        case 'wallet_addEthereumChain': {
          wallet.addedChains.push(p[0])
          wallet.knownChains.add(Number.parseInt(String(p[0]?.chainId), 16))
          return null
        }
        case 'eth_sendTransaction': {
          if (wallet.rejectNextSend) {
            wallet.rejectNextSend = false
            throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
          }
          wallet.sent.push(p[0])
          return forward(method, p)
        }
        default:
          return forward(method, p)
      }
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener as Listener)
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener as Listener)
    },
    switchAccount(next) {
      wallet.account = next
      emit('accountsChanged', [next])
    },
    setChain(id) {
      wallet.chainId = id
      emit('chainChanged', `0x${id.toString(16)}`)
    },
  }
  return wallet
}
