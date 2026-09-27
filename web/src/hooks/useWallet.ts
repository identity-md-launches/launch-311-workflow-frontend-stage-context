import { useCallback, useEffect, useState } from 'react'
import { getAddress, type Address } from 'viem'
import type { Deployment } from '../config'
import { describeError } from '../lib/errors'
import { discoverWallets, ensureChain, parseChainId, type Eip1193Provider, type WalletInfo } from '../lib/wallet'

const REMEMBER_KEY = 'lab-tictactoe.wallet'

export interface WalletState {
  /** Wallets found in the browser; null until discovery has run once. */
  wallets: WalletInfo[] | null
  selected: WalletInfo | null
  provider: Eip1193Provider | null
  account: Address | null
  chainId: number | null
  busy: boolean
  error: string | null
  connect(wallet: WalletInfo): Promise<void>
  disconnect(): void
  switchChain(): Promise<void>
}

function firstAccount(accounts: unknown): Address | null {
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') return null
  try {
    return getAddress(accounts[0])
  } catch {
    return null
  }
}

export function useWallet(deployment: Deployment): WalletState {
  const [wallets, setWallets] = useState<WalletInfo[] | null>(null)
  const [selected, setSelected] = useState<WalletInfo | null>(null)
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => discoverWallets(setWallets), [])

  // Reconnect silently to the wallet used last time, without prompting.
  useEffect(() => {
    if (!wallets || selected) return
    const remembered = window.localStorage.getItem(REMEMBER_KEY)
    const wallet = wallets.find((w) => w.id === remembered)
    if (!wallet) return
    let cancelled = false
    ;(async () => {
      try {
        const accounts = await wallet.provider.request({ method: 'eth_accounts' })
        const first = firstAccount(accounts)
        if (cancelled || !first) return
        const id = parseChainId(await wallet.provider.request({ method: 'eth_chainId' }))
        if (cancelled) return
        setSelected(wallet)
        setAccount(first)
        setChainId(id)
      } catch {
        // A wallet that refuses silent reconnection just stays disconnected.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [wallets, selected])

  // Follow account and chain changes from the selected wallet.
  useEffect(() => {
    if (!selected) return
    const provider = selected.provider
    const onAccounts = (accounts: unknown) => {
      const first = firstAccount(accounts)
      setAccount(first)
      if (!first) window.localStorage.removeItem(REMEMBER_KEY)
    }
    const onChain = (id: unknown) => setChainId(parseChainId(id))
    provider.on?.('accountsChanged', onAccounts as never)
    provider.on?.('chainChanged', onChain as never)
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts as never)
      provider.removeListener?.('chainChanged', onChain as never)
    }
  }, [selected])

  const connect = useCallback(async (wallet: WalletInfo) => {
    setBusy(true)
    setError(null)
    try {
      const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' })
      const first = firstAccount(accounts)
      if (!first) throw new Error('The wallet returned no account. Unlock it and try again.')
      const id = parseChainId(await wallet.provider.request({ method: 'eth_chainId' }))
      setSelected(wallet)
      setAccount(first)
      setChainId(id)
      window.localStorage.setItem(REMEMBER_KEY, wallet.id)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setSelected(null)
    setAccount(null)
    setChainId(null)
    setError(null)
    window.localStorage.removeItem(REMEMBER_KEY)
  }, [])

  const switchChain = useCallback(async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await ensureChain(selected.provider, deployment.chainId, deployment.addChainParams)
      setChainId(parseChainId(await selected.provider.request({ method: 'eth_chainId' })))
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }, [selected, deployment])

  return {
    wallets,
    selected,
    provider: selected?.provider ?? null,
    account,
    chainId,
    busy,
    error,
    connect,
    disconnect,
    switchChain,
  }
}
