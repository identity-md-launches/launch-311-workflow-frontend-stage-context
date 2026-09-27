import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

/** Contract error names mapped to plain instructions. Anything unknown falls back to the decoded name. */
const CONTRACT_ERRORS: Record<string, string> = {
  StakeTooLow: 'Stake at least 1 NGHT.',
  StakeTooLarge: 'Choose a smaller stake.',
  GameNotFound: 'That game id does not exist yet.',
  GameNotOpen: 'This game is no longer open. Refresh and pick another game.',
  GameNotActive: 'This game is not active any more.',
  NotCreator: 'Only the player who opened the game can cancel it.',
  SelfJoin: 'You cannot join your own game.',
  NotYourTurn: 'It is not your move.',
  CellOutOfRange: 'Choose a cell on the board.',
  CellOccupied: 'That cell is already taken. Choose an empty cell.',
  NotOpponent: 'Only the player who is waiting can claim the timeout.',
  DeadlineNotReached: 'The move clock has not run out yet.',
  NothingToWithdraw: 'Nothing is credited to this wallet yet.',
  ERC20InsufficientAllowance: 'Approve enough NGHT for this stake first.',
  ERC20InsufficientBalance: 'This wallet does not hold enough NGHT.',
  SafeERC20FailedOperation: 'The NGHT transfer failed. Check your balance and allowance.',
  ReentrancyGuardReentrantCall: 'The contract refused a re-entrant call.',
}

function hasCode(value: unknown, code: number): boolean {
  return typeof value === 'object' && value !== null && (value as { code?: unknown }).code === code
}

function* causes(error: unknown): Generator<unknown> {
  let current: unknown = error
  let depth = 0
  while (current && depth < 10) {
    yield current
    current = (current as { cause?: unknown }).cause
    depth++
  }
}

/** True when the visitor dismissed the wallet prompt. */
export function isUserRejection(error: unknown): boolean {
  for (const c of causes(error)) {
    if (c instanceof UserRejectedRequestError) return true
    if (hasCode(c, 4001)) return true
  }
  return false
}

/** True when the wallet does not know the requested chain (EIP-3085/3326 code 4902 or an equivalent message). */
export function isUnknownChainError(error: unknown): boolean {
  for (const c of causes(error)) {
    if (hasCode(c, 4902)) return true
    const data = (c as { data?: { originalError?: { code?: number } } }).data
    if (data && hasCode(data.originalError, 4902)) return true
    const message = (c as { message?: string }).message
    if (typeof message === 'string' && /unrecognized chain|unknown chain|wallet_addEthereumChain|chain .* not (?:been )?added/i.test(message)) {
      return true
    }
  }
  return false
}

/** One short sentence a visitor can act on. */
export function describeError(error: unknown): string {
  if (isUserRejection(error)) return 'Request cancelled in the wallet. Nothing was sent.'
  for (const c of causes(error)) {
    if (c instanceof ContractFunctionRevertedError) {
      const name = c.data?.errorName ?? c.reason
      if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name]
      if (name) return `The contract rejected this action (${name}).`
      return 'The contract rejected this action.'
    }
  }
  if (error instanceof BaseError) return error.shortMessage
  if (error instanceof Error) return error.message
  return 'Something went wrong. Try again.'
}
