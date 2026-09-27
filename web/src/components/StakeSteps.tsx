import { formatAmount } from '../lib/format'

interface Props {
  /** Amount that will be pulled by the paying action, or null when not yet known. */
  stake: bigint | null
  allowance: bigint | null
  balance: bigint | null
  /** "Open game" or "Join game". */
  actionLabel: string
  /** Wallet connected on the right chain. */
  ready: boolean
  busy: boolean
  disabledReason?: string | null
  onApprove(amount: bigint): void
  onAction(): void
}

/** The two-step approve-then-pay control shared by opening and joining. */
export function StakeSteps({ stake, allowance, balance, actionLabel, ready, busy, disabledReason, onApprove, onAction }: Props) {
  const known = stake !== null && stake > 0n
  const approved = known && allowance !== null && allowance >= stake
  const funded = known && balance !== null && balance >= stake
  const stakeText = known ? `${formatAmount(stake, 18)} NGHT` : 'NGHT'

  let reason: string | null = disabledReason ?? null
  if (!reason) {
    if (!ready) reason = 'Connect a wallet on the right network first.'
    else if (!known) reason = 'Enter a stake first.'
    else if (!funded) reason = `This wallet holds ${formatAmount(balance ?? 0n, 18)} NGHT, less than the ${stakeText} stake.`
    else if (!approved) reason = `Approve ${stakeText} first. Step 1 lets the game pull exactly this stake.`
  }
  const canApprove = ready && known && !approved && !busy && !disabledReason
  const canAct = ready && approved && funded && !busy && !disabledReason

  return (
    <ol className="steps">
      <li className={approved ? 'step step-done' : 'step'}>
        <span className="step-label">Step 1</span>
        <button type="button" className={canApprove ? 'btn btn-primary' : 'btn'} onClick={() => known && onApprove(stake)} disabled={!canApprove}>
          {approved ? `Approved ${stakeText}` : `Approve ${stakeText}`}
        </button>
        {approved && (
          <span className="muted">
            <span aria-hidden="true">✓ </span>Allowance covers this stake.
          </span>
        )}
      </li>
      <li className="step">
        <span className="step-label">Step 2</span>
        <button type="button" className={canAct ? 'btn btn-primary' : 'btn'} onClick={onAction} disabled={!canAct}>
          {actionLabel}
        </button>
        {!canAct && reason && <span className="muted step-reason">{reason}</span>}
      </li>
    </ol>
  )
}
