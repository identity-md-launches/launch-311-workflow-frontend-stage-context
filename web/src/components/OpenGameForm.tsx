import { useId, useState, type FormEvent } from 'react'
import type { AccountState } from '../hooks/useChainState'
import { parseAmount } from '../lib/format'
import { StakeSteps } from './StakeSteps'

const MIN_STAKE = 1_000_000_000_000_000_000n // 1 NGHT, TicTacToeWager.MIN_STAKE
const MAX_STAKE = (1n << 96n) - 1n // uint96

interface Props {
  ready: boolean
  account: AccountState | null
  busy: boolean
  onApprove(amount: bigint): void
  onOpen(stake: bigint): void
}

/** Open a new game: choose a stake, approve it, then open. The creator plays X. */
export function OpenGameForm({ ready, account, busy, onApprove, onOpen }: Props) {
  const [input, setInput] = useState('1')
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()

  const parsed = parseAmount(input, 18)
  let error = parsed.error
  if (!error && parsed.value !== null && parsed.value < MIN_STAKE) error = 'Stake at least 1 NGHT.'
  if (!error && parsed.value !== null && parsed.value > MAX_STAKE) error = 'Choose a smaller stake.'
  const stake = error ? null : parsed.value

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (stake !== null) onOpen(stake)
  }

  return (
    <section className="card" aria-labelledby="open-heading">
      <h2 id="open-heading">Open a game</h2>
      <p className="muted">You play X and move first once someone joins with the same stake. Win to take both stakes; a draw returns each stake.</p>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={inputId}>Stake per player</label>
          <div className="input-row">
            <input
              id={inputId}
              className="input num"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              aria-invalid={error ? true : undefined}
            />
            <span className="input-unit" aria-hidden="true">
              NGHT
            </span>
          </div>
          <p id={hintId} className="hint">
            Minimum 1 NGHT. Example: 2.5
          </p>
          {error && (
            <p id={errorId} className="field-error">
              <span aria-hidden="true">! </span>
              {error}
            </p>
          )}
        </div>
        <StakeSteps
          stake={stake}
          allowance={account?.allowance ?? null}
          balance={account?.balance ?? null}
          actionLabel="Open game"
          ready={ready}
          busy={busy}
          onApprove={onApprove}
          onAction={() => stake !== null && onOpen(stake)}
        />
      </form>
    </section>
  )
}
