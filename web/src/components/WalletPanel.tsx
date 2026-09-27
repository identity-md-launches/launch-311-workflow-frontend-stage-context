import type { Address } from 'viem'
import type { Deployment } from '../config'
import type { ChainSnapshot } from '../hooks/useChainState'
import { formatAmount } from '../lib/format'
import { AddressLink } from './AddressLink'

interface Props {
  deployment: Deployment
  account: Address | null
  ready: boolean
  snapshot: ChainSnapshot | null
  busy: boolean
  onWithdraw(): void
}

const TOKEN_SYMBOL = 'NGHT'
const TOKEN_DECIMALS = 18

/** NGHT balance, allowance to the game, withdrawable credit, Withdraw, and where NGHT comes from. */
export function WalletPanel({ deployment, account, ready, snapshot, busy, onWithdraw }: Props) {
  const acct = snapshot?.account ?? null
  const value = (v: bigint | undefined) => (v === undefined ? '—' : `${formatAmount(v, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`)
  const canWithdraw = ready && !!acct && acct.withdrawable > 0n && !busy
  const { explorer, nativeCurrency } = deployment.network
  const quote = snapshot?.quote ?? null

  return (
    <section className="card" aria-labelledby="wallet-heading">
      <h2 id="wallet-heading">Your NGHT</h2>
      {!account && <p className="muted">Connect a wallet to see its balance, allowance and credited winnings.</p>}
      <dl className="stats">
        <div>
          <dt>Balance</dt>
          <dd className="num">{value(acct?.balance)}</dd>
        </div>
        <div>
          <dt>
            Allowance to the game <span className="muted">(approved, not yet staked)</span>
          </dt>
          <dd className="num">{value(acct?.allowance)}</dd>
        </div>
        <div>
          <dt>Withdrawable</dt>
          <dd className="num">{value(acct?.withdrawable)}</dd>
        </div>
      </dl>
      <div className="actions">
        <button type="button" className="btn" onClick={onWithdraw} disabled={!canWithdraw}>
          Withdraw {acct && acct.withdrawable > 0n ? `${formatAmount(acct.withdrawable, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}` : TOKEN_SYMBOL}
        </button>
        {account && acct && acct.withdrawable === 0n && <span className="muted">Winnings, draws, refunds and timeouts are credited here until you withdraw.</span>}
      </div>
      <h3>Getting NGHT</h3>
      <p>
        NGHT comes from swapping {deployment.network.name} {nativeCurrency.symbol} in the launch pool on Uniswap v4. This page does not swap.
        {' '}
        <AddressLink address={deployment.token.address} explorer={explorer} label="NGHT token" full />
      </p>
      <p className="muted num">
        {quote === null && 'Pool rate: loading…'}
        {quote && 'error' in quote && 'Pool rate unavailable right now.'}
        {quote && 'amountOut' in quote && (
          <>
            Pool rate now: {formatAmount(quote.amountIn, nativeCurrency.decimals, 4)} {nativeCurrency.symbol} ≈ {formatAmount(quote.amountOut, TOKEN_DECIMALS, 2)} {TOKEN_SYMBOL} (quoted by the Uniswap v4 quoter, before slippage)
          </>
        )}
      </p>
    </section>
  )
}
