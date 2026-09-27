import { zeroAddress, type Address } from 'viem'
import { sameAddress } from './format'

/** Mirrors TicTacToeWager.Status. */
export const Status = { None: 0, Open: 1, Active: 2, Finished: 3, Cancelled: 4 } as const
/** Mirrors TicTacToeWager.Mark. */
export const Mark = { Empty: 0, X: 1, O: 2 } as const
export type MarkValue = 0 | 1 | 2

/** `game(id)` as decoded by viem, plus the id it was read for. */
export interface GameRecord {
  id: bigint
  playerX: Address
  stake: bigint
  playerO: Address
  moveDeadline: number
  board: number
  status: number
  turn: number
}

/** The eight winning lines as 9-bit cell bitmaps, bit i = cell i (row-major). */
export const LINES: readonly number[] = [0x007, 0x038, 0x1c0, 0x049, 0x092, 0x124, 0x111, 0x054]

/** Unpacks the two-bits-per-cell board word into nine cells (0 empty, 1 X, 2 O). */
export function decodeBoard(packed: number): MarkValue[] {
  const cells: MarkValue[] = []
  for (let i = 0; i < 9; i++) cells.push(((packed >>> (i * 2)) & 3) as MarkValue)
  return cells
}

export function marksBitmap(cells: readonly MarkValue[], mark: MarkValue): number {
  let bits = 0
  cells.forEach((cell, i) => {
    if (cell === mark) bits |= 1 << i
  })
  return bits
}

/** Cells of the first completed line for `mark`, or null. */
export function winningLine(cells: readonly MarkValue[], mark: MarkValue): number[] | null {
  const bits = marksBitmap(cells, mark)
  for (const line of LINES) {
    if ((bits & line) === line) return [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => (line >> i) & 1)
  }
  return null
}

export function isFull(cells: readonly MarkValue[]): boolean {
  return cells.every((c) => c !== Mark.Empty)
}

export type Outcome =
  | { kind: 'none' }
  | { kind: 'win'; winner: Address; mark: MarkValue; line: number[] }
  | { kind: 'draw' }
  | { kind: 'timeout'; winner: Address; loser: Address }

/**
 * Reconstructs how a Finished game ended from its record alone: a completed line is a win, a full
 * board without one is a draw, anything else was a timeout claimed against the player to move.
 */
export function outcome(game: GameRecord): Outcome {
  if (game.status !== Status.Finished) return { kind: 'none' }
  const cells = decodeBoard(game.board)
  const xLine = winningLine(cells, Mark.X)
  if (xLine) return { kind: 'win', winner: game.playerX, mark: Mark.X, line: xLine }
  const oLine = winningLine(cells, Mark.O)
  if (oLine) return { kind: 'win', winner: game.playerO, mark: Mark.O, line: oLine }
  if (isFull(cells)) return { kind: 'draw' }
  const loser = game.turn === Mark.X ? game.playerX : game.playerO
  const winner = game.turn === Mark.X ? game.playerO : game.playerX
  return { kind: 'timeout', winner, loser }
}

/** Address of the player to move, or null when the game is not active. */
export function playerToMove(game: GameRecord): Address | null {
  if (game.status !== Status.Active) return null
  return game.turn === Mark.X ? game.playerX : game.playerO
}

/** Address of the player who may claim a timeout, or null when the game is not active. */
export function playerWaiting(game: GameRecord): Address | null {
  if (game.status !== Status.Active) return null
  return game.turn === Mark.X ? game.playerO : game.playerX
}

export function markOf(game: GameRecord, account: Address | null): MarkValue {
  if (sameAddress(account, game.playerX)) return Mark.X
  if (account && game.playerO !== zeroAddress && sameAddress(account, game.playerO)) return Mark.O
  return Mark.Empty
}

export function statusLabel(status: number): string {
  switch (status) {
    case Status.Open:
      return 'Open'
    case Status.Active:
      return 'Active'
    case Status.Finished:
      return 'Finished'
    case Status.Cancelled:
      return 'Cancelled'
    default:
      return 'Unknown'
  }
}

export function markLabel(mark: MarkValue): string {
  return mark === Mark.X ? 'X' : mark === Mark.O ? 'O' : 'empty'
}
