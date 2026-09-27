import { useId, useState, type FormEvent } from 'react'
import { zeroAddress, type Address } from 'viem'
import { formatAmount, sameAddress, shortAddress } from '../lib/format'
import { Status, statusLabel, type GameRecord } from '../lib/game'

type Filter = 'all' | 'open' | 'mine'

interface Props {
  games: GameRecord[]
  gameCount: bigint
  account: Address | null
  selectedId: bigint | null
  loading: boolean
  onSelect(id: bigint): void
  onLookup(id: bigint): void
  onRefresh(): void
}

/** Newest games from `gameCount()`/`game(id)`, filterable, with a lookup for older ids. */
export function GameList({ games, gameCount, account, selectedId, loading, onSelect, onLookup, onRefresh }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [lookup, setLookup] = useState('')
  const filterId = useId()
  const lookupId = useId()

  const isMine = (g: GameRecord) => sameAddress(account, g.playerX) || (g.playerO !== zeroAddress && sameAddress(account, g.playerO))
  const visible = games.filter((g) => (filter === 'open' ? g.status === Status.Open : filter === 'mine' ? isMine(g) : true))

  const submitLookup = (event: FormEvent) => {
    event.preventDefault()
    const text = lookup.trim()
    if (/^\d+$/.test(text)) onLookup(BigInt(text))
  }

  return (
    <section className="card" aria-labelledby="games-heading">
      <div className="card-head">
        <h2 id="games-heading">Games</h2>
        <button type="button" className="btn btn-quiet" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="toolbar">
        <div className="field field-inline">
          <label htmlFor={filterId}>Show</label>
          <select id={filterId} className="input" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">All games</option>
            <option value="open">Open games</option>
            <option value="mine">My games</option>
          </select>
        </div>
        <form className="field field-inline" onSubmit={submitLookup}>
          <label htmlFor={lookupId}>Game id</label>
          <input id={lookupId} className="input num input-short" type="text" inputMode="numeric" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="e.g. 12" />
          <button type="submit" className="btn">
            Look up
          </button>
        </form>
      </div>
      {gameCount === 0n && <p className="empty">No games yet. Open the first one above.</p>}
      {gameCount > 0n && visible.length === 0 && (
        <p className="empty">
          {filter === 'open' && 'No open games right now. Open one above, or show all games.'}
          {filter === 'mine' && (account ? 'None of the newest games involve this wallet.' : 'Connect a wallet to see your games.')}
          {filter === 'all' && 'No games loaded.'}
        </p>
      )}
      {visible.length > 0 && (
        <ul className="game-list">
          {visible.map((g) => {
            const you = isMine(g)
            const selected = g.id === selectedId
            return (
              <li key={g.id.toString()} className={selected ? 'game-row selected' : 'game-row'}>
                <div className="game-row-main">
                  <span className="game-id num">#{g.id.toString()}</span>
                  <span className="badge">{statusLabel(g.status)}</span>
                  <span className="num">{formatAmount(g.stake, 18)} NGHT</span>
                  {you && <span className="badge badge-you">You</span>}
                </div>
                <div className="game-row-players mono muted">
                  <span className="nowrap">X {shortAddress(g.playerX)}</span>
                  <span className="nowrap">O {g.playerO === zeroAddress ? 'waiting for a player' : shortAddress(g.playerO)}</span>
                </div>
                <button type="button" className={selected ? 'btn btn-quiet' : 'btn'} onClick={() => onSelect(g.id)} aria-pressed={selected} aria-label={`View game ${g.id.toString()}`}>
                  {selected ? 'Viewing' : 'View'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {gameCount > BigInt(games.length) && games.length > 0 && (
        <p className="muted">
          Showing the newest {games.length} of {gameCount.toString()} games. Look up older ones by id.
        </p>
      )}
    </section>
  )
}
