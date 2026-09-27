import { zeroAddress, type Address } from 'viem'
import type { AccountState } from '../hooks/useChainState'
import { formatAmount, formatCountdown, sameAddress, shortAddress } from '../lib/format'
import { Mark, Status, decodeBoard, markLabel, markOf, outcome, playerToMove, playerWaiting, statusLabel, type GameRecord, type MarkValue } from '../lib/game'
import { AddressLink } from './AddressLink'
import { Notice } from './Notice'
import { StakeSteps } from './StakeSteps'

interface Props {
  game: GameRecord | null
  account: Address | null
  accountState: AccountState | null
  ready: boolean
  busy: boolean
  chainNow: number | null
  explorer: string
  onApprove(amount: bigint): void
  onJoin(id: bigint): void
  onCancel(id: bigint): void
  onMove(id: bigint, cell: number): void
  onClaimTimeout(id: bigint): void
}

const WARN_SECONDS = 120

/** The selected game: players, stake, turn, move clock, the 3×3 board and every game action. */
export function GameBoard({ game, account, accountState, ready, busy, chainNow, explorer, onApprove, onJoin, onCancel, onMove, onClaimTimeout }: Props) {
  if (!game) {
    return (
      <section className="card" aria-labelledby="board-heading">
        <h2 id="board-heading">Board</h2>
        <p className="empty">No game selected. Open a game or choose one from the list to see its board.</p>
      </section>
    )
  }

  const cells = decodeBoard(game.board)
  const yourMark = markOf(game, account)
  const toMove = playerToMove(game)
  const waiting = playerWaiting(game)
  const yourTurn = ready && toMove !== null && sameAddress(toMove, account)
  const youWait = ready && waiting !== null && sameAddress(waiting, account)
  const result = outcome(game)
  const winLine = result.kind === 'win' ? result.line : []
  const remaining = game.status === Status.Active && chainNow !== null ? game.moveDeadline - chainNow : null
  const expired = remaining !== null && remaining <= 0
  const isCreator = sameAddress(account, game.playerX)
  const hasO = game.playerO !== zeroAddress

  const playerLine = (mark: MarkValue, address: Address) => (
    <span>
      <strong>{markLabel(mark)}</strong> <AddressLink address={address} explorer={explorer} label={`Player ${markLabel(mark)}`} />
      {sameAddress(address, account) && <span className="badge badge-you">You</span>}
    </span>
  )

  return (
    <section className="card" aria-labelledby="board-heading">
      <div className="card-head">
        <h2 id="board-heading">
          Game <span className="num">#{game.id.toString()}</span>
        </h2>
        <span className="badge">{statusLabel(game.status)}</span>
      </div>
      <dl className="stats stats-inline">
        <div>
          <dt>Players</dt>
          <dd>
            {playerLine(Mark.X, game.playerX)}
            <br />
            {hasO ? playerLine(Mark.O, game.playerO) : <span className="muted">O waiting for a player</span>}
          </dd>
        </div>
        <div>
          <dt>Stake</dt>
          <dd className="num">
            {formatAmount(game.stake, 18)} NGHT each, pot {formatAmount(game.stake * 2n, 18)} NGHT
          </dd>
        </div>
      </dl>

      {game.status === Status.Active && (
        <div className="turn-line" aria-live="off">
          <p className="turn">
            {yourTurn ? `Your move (${markLabel(yourMark)})` : `${markLabel(game.turn as MarkValue)} to move${toMove ? ` (${shortAddress(toMove)})` : ''}`}
          </p>
          <p className={expired || (remaining !== null && remaining <= WARN_SECONDS) ? 'clock clock-warn num' : 'clock num'}>
            Move clock: {remaining === null ? '—' : expired ? 'expired' : formatCountdown(remaining)}
          </p>
        </div>
      )}

      <div className="board" role="group" aria-label={`Board of game ${game.id.toString()}`}>
        {cells.map((cell, i) => {
          const canPlay = yourTurn && cell === Mark.Empty && !busy
          const inLine = winLine.includes(i)
          return (
            <button
              key={i}
              type="button"
              className={`cell${inLine ? ' cell-win' : ''}${cell !== Mark.Empty ? ' cell-filled' : ''}`}
              disabled={!canPlay}
              onClick={() => onMove(game.id, i)}
              aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${markLabel(cell)}${inLine ? ', winning line' : ''}`}
            >
              {cell === Mark.Empty ? '' : markLabel(cell)}
            </button>
          )
        })}
      </div>

      {game.status === Status.Open && (
        <>
          {isCreator ? (
            <div className="actions">
              <button type="button" className="btn" onClick={() => onCancel(game.id)} disabled={!ready || busy}>
                Cancel game
              </button>
              <span className="muted">Nobody has joined yet. Cancelling credits your stake to Withdrawable.</span>
            </div>
          ) : (
            <>
              <h3>Join as O</h3>
              <p className="muted">Matching stake: {formatAmount(game.stake, 18)} NGHT. X moves first and has one hour per move, as do you.</p>
              <StakeSteps
                stake={game.stake}
                allowance={accountState?.allowance ?? null}
                balance={accountState?.balance ?? null}
                actionLabel="Join game"
                ready={ready}
                busy={busy}
                onApprove={onApprove}
                onAction={() => onJoin(game.id)}
              />
            </>
          )}
        </>
      )}

      {game.status === Status.Active && yourTurn && expired && (
        <Notice kind="warning">Your clock has run out. Your opponent can claim the pot at any moment; a move that is mined first still counts.</Notice>
      )}
      {game.status === Status.Active && yourTurn && !expired && remaining !== null && remaining <= WARN_SECONDS && (
        <Notice kind="warning">Less than two minutes left. If the clock runs out your opponent can claim both stakes.</Notice>
      )}
      {game.status === Status.Active && youWait && (
        <div className="actions">
          <button type="button" className={expired ? 'btn btn-primary' : 'btn'} onClick={() => onClaimTimeout(game.id)} disabled={!expired || busy}>
            Claim timeout
          </button>
          <span className="muted">
            {expired
              ? `The opponent's clock ran out. Claiming credits the ${formatAmount(game.stake * 2n, 18)} NGHT pot to you unless they move first.`
              : `Available when the opponent's move clock runs out (${remaining === null ? '—' : formatCountdown(remaining)} left).`}
          </span>
        </div>
      )}
      {game.status === Status.Active && !yourTurn && !youWait && ready && <p className="muted">You are not a player in this game.</p>}
      {game.status === Status.Active && !ready && <p className="muted">Connect a wallet on the right network to play.</p>}

      {game.status === Status.Finished && (
        <Notice kind="success">
          {result.kind === 'win' && (
            <>
              {markLabel(result.mark)} ({shortAddress(result.winner)}) won. {formatAmount(game.stake * 2n, 18)} NGHT credited to the winner's Withdrawable.
            </>
          )}
          {result.kind === 'draw' && <>Draw. Each player's {formatAmount(game.stake, 18)} NGHT was credited back to Withdrawable.</>}
          {result.kind === 'timeout' && (
            <>
              {shortAddress(result.loser)} ran out of time. {shortAddress(result.winner)} claimed the {formatAmount(game.stake * 2n, 18)} NGHT pot.
            </>
          )}
        </Notice>
      )}
      {game.status === Status.Cancelled && <Notice kind="info">Cancelled by the creator before anyone joined. The stake was credited back to Withdrawable.</Notice>}
    </section>
  )
}
