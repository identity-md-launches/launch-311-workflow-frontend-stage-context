/**
 * Interaction tests against the real contracts on a local anvil chain, driven through the page with
 * a mocked EIP-1193 wallet. Tests in this file run in order and share chain state.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest'
import App from '../src/App'
import { networkFile, rpc, stubManifestFetch, testManifest } from './helpers/fixtures'
import { createMockWallet, type MockWallet } from './helpers/mockWallet'

const anvil = inject('anvil')
const [, player1, player2] = anvil.accounts as [Address, Address, Address]
const WAIT = { timeout: 30_000 }
const user = userEvent.setup()

function stat(label: string | RegExp): string {
  const dt = screen.getByText((_, el) => el?.tagName === 'DT' && (typeof label === 'string' ? el.textContent === label : label.test(el.textContent ?? '')))
  return dt.nextElementSibling?.textContent ?? ''
}
const region = (name: string | RegExp) => within(screen.getByRole('region', { name }))
const cellName = (row: number, col: number, mark: string) => `Row ${row}, column ${col}: ${mark}`
const clickCell = async (row: number, col: number) => {
  const cell = await screen.findByRole('button', { name: cellName(row, col, 'empty') }, WAIT)
  await waitFor(() => expect(cell).toBeEnabled(), WAIT)
  await user.click(cell)
}

async function connect(wallet: MockWallet) {
  window.ethereum = wallet
  render(<App pollMs={400} />)
  await user.click(await screen.findByRole('button', { name: 'Connect wallet' }, WAIT))
  await screen.findByText('Connected wallet', { exact: false }, WAIT)
}

async function runTx(button: HTMLElement) {
  await waitFor(() => expect(button).toBeEnabled(), WAIT)
  await user.click(button)
  await screen.findByText(/confirmed,/, {}, WAIT)
}

beforeAll(() => {
  stubManifestFetch(testManifest(anvil))
})

afterEach(() => {
  delete window.ethereum
})

describe('disconnected visitor', () => {
  it('shows contract state and the missing-wallet notice, with every configured address linked', async () => {
    render(<App pollMs={400} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Noughts tic-tac-toe' }, WAIT)).toBeInTheDocument()
    expect(await screen.findByText(/No browser wallet found/, {}, WAIT)).toBeInTheDocument()
    expect(await screen.findByText('No games yet. Open the first one above.', {}, WAIT)).toBeInTheDocument()
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: new RegExp(`LaunchToken ${anvil.token}`) })).toHaveAttribute('href', `${networkFile.network.explorer}/address/${anvil.token}`)
    expect(footer.getByRole('link', { name: new RegExp(`TicTacToeWager ${anvil.game}`) })).toBeInTheDocument()
    expect(footer.getByText(String(networkFile.network.chainId))).toBeInTheDocument()
    expect(stat('Balance')).toBe('—')
    expect(screen.getByRole('button', { name: /^Withdraw/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open game' })).toBeDisabled()
    expect(screen.getByText('Connect a wallet on the right network first.')).toBeInTheDocument()
    // Pool quote is not available on anvil (no Uniswap contracts); the page says so instead of failing.
    expect(await screen.findByText('Pool rate unavailable right now.', {}, WAIT)).toBeInTheDocument()
  })
})

describe('wrong network', () => {
  it('offers a single switch control and adds the chain when the wallet does not know it', async () => {
    const wallet = createMockWallet({ rpcUrl: anvil.rpcUrl, account: player1, chainId: 1, knownChains: [1] })
    await connect(wallet)
    expect(await screen.findByText(/Your wallet is on another network \(chain id 1\)/, {}, WAIT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open game' })).toBeDisabled()
    const switchButton = screen.getByRole('button', { name: 'Switch to Sepolia' })
    await user.click(switchButton)
    // The fixture manifest lists anvil as the RPC; everything else must equal the handoff's walletAddChain block.
    await waitFor(() => expect(wallet.addedChains).toEqual([{ ...networkFile.walletAddChain, rpcUrls: [anvil.rpcUrl] }]), WAIT)
    await waitFor(() => expect(wallet.chainId).toBe(anvil.chainId), WAIT)
    expect(await screen.findByText('Sepolia', { selector: '.chip-ok' }, WAIT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Switch to Sepolia' })).not.toBeInTheDocument()
    await waitFor(() => expect(stat('Balance')).toBe('1,000 NGHT'), WAIT)
  })
})

describe('playing', () => {
  it('approves, opens, joins, plays to a win and withdraws', async () => {
    const wallet = createMockWallet({ rpcUrl: anvil.rpcUrl, account: player1, chainId: anvil.chainId })
    await connect(wallet)
    await waitFor(() => expect(stat('Balance')).toBe('1,000 NGHT'), WAIT)
    expect(stat(/^Allowance/)).toBe('0 NGHT')
    expect(stat('Withdrawable')).toBe('0 NGHT')

    // Stake 5 NGHT: Open stays disabled with a reason until the approval lands.
    const form = region('Open a game')
    const stakeInput = form.getByLabelText('Stake per player')
    await user.clear(stakeInput)
    await user.type(stakeInput, '5')
    expect(form.getByRole('button', { name: 'Open game' })).toBeDisabled()
    expect(form.getByText(/Approve 5 NGHT first/)).toBeInTheDocument()
    await runTx(form.getByRole('button', { name: 'Approve 5 NGHT' }))
    await waitFor(() => expect(stat(/^Allowance/)).toBe('5 NGHT'), WAIT)
    expect(form.getByRole('button', { name: 'Approved 5 NGHT' })).toBeDisabled()
    const approveTx = wallet.sent.at(-1) as { to: string; from: string }
    expect(approveTx.to.toLowerCase()).toBe(anvil.token.toLowerCase())
    expect(approveTx.from.toLowerCase()).toBe(player1.toLowerCase())

    await runTx(form.getByRole('button', { name: 'Open game' }))
    expect((wallet.sent.at(-1) as { to: string }).to.toLowerCase()).toBe(anvil.game.toLowerCase())
    await waitFor(() => expect(stat('Balance')).toBe('995 NGHT'), WAIT)
    expect(await screen.findByRole('heading', { name: 'Game #0' }, WAIT)).toBeInTheDocument()
    const board = region(/^Game #0/)
    expect(board.getByText('Open', { selector: '.badge' })).toBeInTheDocument()
    expect(board.getByRole('button', { name: 'Cancel game' })).toBeEnabled()
    expect(board.getByText('O waiting for a player')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View game 0' })).toHaveAttribute('aria-pressed', 'true')

    // Player 2 joins with the matching stake through the same two-step control.
    wallet.switchAccount(player2)
    await waitFor(() => expect(board.getByRole('heading', { name: 'Join as O' })).toBeInTheDocument(), WAIT)
    await waitFor(() => expect(stat('Balance')).toBe('1,000 NGHT'), WAIT)
    expect(board.getByRole('button', { name: 'Join game' })).toBeDisabled()
    await runTx(board.getByRole('button', { name: 'Approve 5 NGHT' }))
    await runTx(board.getByRole('button', { name: 'Join game' }))
    await waitFor(() => expect(board.getByText('Active', { selector: '.badge' })).toBeInTheDocument(), WAIT)
    expect(await board.findByText(/^X to move/, {}, WAIT)).toBeInTheDocument()
    expect(board.getByText(/^Move clock: (59|1:00)/)).toBeInTheDocument()
    // O is waiting: the timeout claim exists but is not yet available.
    expect(board.getByRole('button', { name: 'Claim timeout' })).toBeDisabled()
    expect(board.getByText(/Available when the opponent's move clock runs out/)).toBeInTheDocument()
    expect(board.getByRole('button', { name: cellName(1, 1, 'empty') })).toBeDisabled()

    // X: (1,1) O: (2,1) X: (1,2) O: (2,2) X: (1,3) -> top row for X.
    wallet.switchAccount(player1)
    expect(await board.findByText('Your move (X)', {}, WAIT)).toBeInTheDocument()
    await clickCell(1, 1)
    expect(await board.findByRole('button', { name: cellName(1, 1, 'X') }, WAIT)).toBeDisabled()
    wallet.switchAccount(player2)
    expect(await board.findByText('Your move (O)', {}, WAIT)).toBeInTheDocument()
    await clickCell(2, 1)
    await board.findByRole('button', { name: cellName(2, 1, 'O') }, WAIT)
    wallet.switchAccount(player1)
    await board.findByText('Your move (X)', {}, WAIT)
    await clickCell(1, 2)
    await board.findByRole('button', { name: cellName(1, 2, 'X') }, WAIT)
    wallet.switchAccount(player2)
    await board.findByText('Your move (O)', {}, WAIT)
    await clickCell(2, 2)
    await board.findByRole('button', { name: cellName(2, 2, 'O') }, WAIT)
    wallet.switchAccount(player1)
    await board.findByText('Your move (X)', {}, WAIT)
    await clickCell(1, 3)

    expect(await board.findByText(/won\. 10 NGHT credited to the winner/, {}, WAIT)).toBeInTheDocument()
    expect(board.getByRole('button', { name: `${cellName(1, 3, 'X')}, winning line` })).toBeInTheDocument()
    await waitFor(() => expect(stat('Withdrawable')).toBe('10 NGHT'), WAIT)
    await runTx(screen.getByRole('button', { name: 'Withdraw 10 NGHT' }))
    await waitFor(() => expect(stat('Balance')).toBe('1,005 NGHT'), WAIT)
    expect(stat('Withdrawable')).toBe('0 NGHT')
  })

  it('lets the waiting player claim a timeout once the hour has passed', async () => {
    const wallet = createMockWallet({ rpcUrl: anvil.rpcUrl, account: player1, chainId: anvil.chainId })
    await connect(wallet)
    const form = region('Open a game')
    await waitFor(() => expect(stat('Balance')).toMatch(/NGHT$/), WAIT)
    await runTx(form.getByRole('button', { name: 'Approve 1 NGHT' }))
    await runTx(form.getByRole('button', { name: 'Open game' }))
    await screen.findByRole('heading', { name: 'Game #1' }, WAIT)
    const board = region(/^Game #1/)

    wallet.switchAccount(player2)
    await board.findByRole('heading', { name: 'Join as O' }, WAIT)
    await runTx(board.getByRole('button', { name: 'Approve 1 NGHT' }))
    await runTx(board.getByRole('button', { name: 'Join game' }))
    const claim = await board.findByRole('button', { name: 'Claim timeout' }, WAIT)
    expect(claim).toBeDisabled()

    await rpc(anvil.rpcUrl, 'evm_increaseTime', [3601])
    await rpc(anvil.rpcUrl, 'evm_mine', [])
    await waitFor(() => expect(board.getByText('Move clock: expired')).toBeInTheDocument(), WAIT)
    await runTx(claim)
    expect(await board.findByText(/ran out of time\..*claimed the 2 NGHT pot/, {}, WAIT)).toBeInTheDocument()
    await waitFor(() => expect(stat('Withdrawable')).toBe('2 NGHT'), WAIT)
  })

  it('cancels an unjoined game and shows a wallet rejection without sending anything', async () => {
    const wallet = createMockWallet({ rpcUrl: anvil.rpcUrl, account: player1, chainId: anvil.chainId })
    await connect(wallet)
    const form = region('Open a game')
    await waitFor(() => expect(stat('Balance')).toMatch(/NGHT$/), WAIT)
    await runTx(form.getByRole('button', { name: 'Approve 1 NGHT' }))
    await runTx(form.getByRole('button', { name: 'Open game' }))
    await screen.findByRole('heading', { name: 'Game #2' }, WAIT)
    const board = region(/^Game #2/)
    await runTx(board.getByRole('button', { name: 'Cancel game' }))
    expect(await board.findByText(/Cancelled by the creator/, {}, WAIT)).toBeInTheDocument()
    await waitFor(() => expect(stat('Withdrawable')).toBe('1 NGHT'), WAIT)

    const sentBefore = wallet.sent.length
    wallet.rejectNextSend = true
    await user.click(screen.getByRole('button', { name: 'Withdraw 1 NGHT' }))
    // The alert region is always mounted; wait for its text rather than for its existence.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Withdraw NGHT failed. Request cancelled in the wallet. Nothing was sent.'), WAIT)
    expect(wallet.sent.length).toBe(sentBefore)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeEmptyDOMElement())

    // The list filter and lookup work from views alone.
    const list = region('Games')
    await user.selectOptions(list.getByLabelText('Show'), 'open')
    expect(await list.findByText(/No open games right now/, {}, WAIT)).toBeInTheDocument()
    await user.selectOptions(list.getByLabelText('Show'), 'mine')
    expect(list.getAllByRole('button', { name: /^View game/ })).toHaveLength(3)
    await user.type(list.getByLabelText('Game id'), '99')
    await user.click(list.getByRole('button', { name: 'Look up' }))
    expect(await screen.findByText(/Game #99 does not exist yet/, {}, WAIT)).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
