import type { Deployment } from '../config'
import type { WalletState } from '../hooks/useWallet'
import { shortAddress } from '../lib/format'
import { Notice } from './Notice'

/** Header control: connect, show the account, or offer the single "Switch to <network>" action. */
export function WalletStatus({ wallet, deployment }: { wallet: WalletState; deployment: Deployment }) {
  const { wallets, account, chainId, busy } = wallet
  const wrongChain = account !== null && chainId !== deployment.chainId

  if (account) {
    return (
      <div className="wallet-status">
        <span className="chip mono" title={account}>
          <span className="sr-only">Connected wallet </span>
          {shortAddress(account)}
        </span>
        {wrongChain ? (
          <button type="button" className="btn btn-primary" onClick={() => void wallet.switchChain()} disabled={busy}>
            {busy ? 'Switching…' : `Switch to ${deployment.network.name}`}
          </button>
        ) : (
          <span className="chip chip-ok">
            <span aria-hidden="true">● </span>
            {deployment.network.name}
          </span>
        )}
        <button type="button" className="btn btn-quiet" onClick={wallet.disconnect}>
          Disconnect
        </button>
      </div>
    )
  }

  if (wallets === null) {
    return (
      <div className="wallet-status">
        <span className="muted">Looking for a wallet…</span>
      </div>
    )
  }

  if (wallets.length === 0) {
    return (
      <div className="wallet-status">
        <Notice kind="info">No browser wallet found. Install a wallet extension such as MetaMask or Rabby, then reload this page.</Notice>
      </div>
    )
  }

  return (
    <div className="wallet-status">
      {wallets.map((w) => (
        <button key={w.id} type="button" className="btn btn-primary" onClick={() => void wallet.connect(w)} disabled={busy}>
          {busy ? 'Connecting…' : wallets.length === 1 ? 'Connect wallet' : `Connect ${w.name}`}
        </button>
      ))}
    </div>
  )
}
