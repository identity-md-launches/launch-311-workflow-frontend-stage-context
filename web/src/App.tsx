import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Hash } from 'viem'
import { DEFAULT_POLL_MS, type Deployment } from './config'
import { ContractsFooter } from './components/ContractsFooter'
import { GameBoard } from './components/GameBoard'
import { GameList } from './components/GameList'
import { Notice } from './components/Notice'
import { OpenGameForm } from './components/OpenGameForm'
import { TxStatus } from './components/TxStatus'
import { WalletPanel } from './components/WalletPanel'
import { WalletStatus } from './components/WalletStatus'
import { useChainNow } from './hooks/useChainNow'
import { useChainState } from './hooks/useChainState'
import { useDeployment } from './hooks/useDeployment'
import { useTx } from './hooks/useTx'
import { useWallet } from './hooks/useWallet'
import { makePublicClient, makeWalletClient } from './lib/chain'
import { formatAmount, sameAddress } from './lib/format'
import type { GameRecord } from './lib/game'

export default function App({ pollMs = DEFAULT_POLL_MS }: { pollMs?: number }) {
  const state = useDeployment()
  if (state.status === 'loading') {
    return (
      <main id="main" className="page">
        <p role="status">Loading deployment configuration…</p>
      </main>
    )
  }
  if (state.status === 'error') {
    return (
      <main id="main" className="page">
        <h1>Noughts tic-tac-toe</h1>
        <Notice kind="error" role="alert">
          Unable to load the deployment configuration, so no contract can be shown. Reload the page; if it keeps failing the export is incomplete. Detail: {state.error}
        </Notice>
      </main>
    )
  }
  return <Dapp deployment={state.deployment} pollMs={pollMs} />
}

function Dapp({ deployment, pollMs }: { deployment: Deployment; pollMs: number }) {
  const wallet = useWallet(deployment)
  const client = useMemo(() => makePublicClient(deployment, wallet.provider), [deployment, wallet.provider])
  const ready = wallet.account !== null && wallet.chainId === deployment.chainId
  const chain = useChainState(client, deployment, wallet.account, pollMs)
  const chainNow = useChainNow(chain.data?.blockTimestamp, chain.data?.fetchedAt)
  const tx = useTx(client, chain.refresh)
  const [selectedId, setSelectedId] = useState<bigint | null>(null)
  const [lookedUp, setLookedUp] = useState<GameRecord | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const games = chain.data?.games ?? []
  const selected = games.find((g) => g.id === selectedId) ?? (lookedUp && lookedUp.id === selectedId ? lookedUp : null)

  // Keep a looked-up game fresh alongside the polled list.
  useEffect(() => {
    if (!lookedUp || games.some((g) => g.id === lookedUp.id)) return
    let cancelled = false
    chain
      .lookup(lookedUp.id)
      .then((g) => {
        if (!cancelled) setLookedUp(g)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain.data?.blockNumber])

  const walletClient = useMemo(
    () => (wallet.provider && wallet.account ? makeWalletClient(deployment.chain, wallet.provider, wallet.account) : null),
    [deployment.chain, wallet.provider, wallet.account],
  )

  /** Simulates first so a revert reason is shown before the wallet ever prompts, then signs in the wallet. */
  const write = useCallback(
    (label: string, contract: 'token' | 'game', functionName: string, args: unknown[]) =>
      tx.run(label, async (): Promise<Hash> => {
        if (!walletClient || !wallet.account) throw new Error('Connect a wallet first.')
        const binding = deployment[contract]
        const { request } = await client.simulateContract({
          account: wallet.account,
          address: binding.address,
          abi: binding.abi,
          functionName,
          args,
        })
        return walletClient.writeContract(request)
      }),
    [tx, walletClient, wallet.account, deployment, client],
  )

  const approve = (amount: bigint) => void write(`Approve ${formatAmount(amount, 18)} NGHT`, 'token', 'approve', [deployment.game.address, amount])
  const open = async (stake: bigint) => {
    const count = chain.data?.gameCount ?? 0n
    const ok = await write(`Open game with ${formatAmount(stake, 18)} NGHT`, 'game', 'open', [stake])
    if (ok) setSelectedId(count) // the new game's id is the previous count
  }
  const join = (id: bigint) => void write(`Join game #${id}`, 'game', 'join', [id])
  const cancel = (id: bigint) => void write(`Cancel game #${id}`, 'game', 'cancel', [id])
  const move = (id: bigint, cell: number) => void write(`Move in game #${id}`, 'game', 'move', [id, cell])
  const claim = (id: bigint) => void write(`Claim timeout in game #${id}`, 'game', 'claimTimeout', [id])
  const withdraw = () => void write('Withdraw NGHT', 'game', 'withdraw', [])

  const lookup = async (id: bigint) => {
    setLookupError(null)
    try {
      const g = await chain.lookup(id)
      setLookedUp(g)
      setSelectedId(id)
    } catch {
      setLookupError(`Game #${id} does not exist yet. Ids run from 0 to ${((chain.data?.gameCount ?? 1n) - 1n).toString()}.`)
    }
  }

  const yourActiveTurn = ready && games.some((g) => g.status === 2 && sameAddress(g.turn === 1 ? g.playerX : g.playerO, wallet.account))

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div>
          <h1>Noughts tic-tac-toe</h1>
          <p className="lede">
            Two players stake the same amount of NGHT on a 3×3 board. Win to take both stakes, draw to get yours back, or claim the pot when your
            opponent lets the one-hour move clock run out. {deployment.network.name} test game with no real value.
          </p>
        </div>
        <WalletStatus wallet={wallet} deployment={deployment} />
      </header>

      <main id="main" className="page">
        {wallet.error && <Notice kind="error" role="alert">{wallet.error}</Notice>}
        {wallet.account && wallet.chainId !== deployment.chainId && (
          <Notice kind="warning">
            Your wallet is on another network{wallet.chainId !== null ? ` (chain id ${wallet.chainId})` : ''}. Use “Switch to {deployment.network.name}” above; if your
            wallet does not know {deployment.network.name} yet it will be offered the network to add.
          </Notice>
        )}
        {chain.error && <Notice kind="warning">Unable to read from the network right now: {chain.error}</Notice>}
        {yourActiveTurn && <Notice kind="info">It is your move in at least one active game.</Notice>}
        <TxStatus state={tx.state} explorer={deployment.network.explorer} onDismiss={tx.dismiss} />

        <div className="layout">
          <div className="column">
            <WalletPanel deployment={deployment} account={wallet.account} ready={ready} snapshot={chain.data} busy={tx.busy} onWithdraw={withdraw} />
            <OpenGameForm ready={ready} account={chain.data?.account ?? null} busy={tx.busy} onApprove={approve} onOpen={(s) => void open(s)} />
          </div>
          <div className="column">
            <GameBoard
              game={selected}
              account={wallet.account}
              accountState={chain.data?.account ?? null}
              ready={ready}
              busy={tx.busy}
              chainNow={chainNow}
              explorer={deployment.network.explorer}
              onApprove={approve}
              onJoin={join}
              onCancel={cancel}
              onMove={move}
              onClaimTimeout={claim}
            />
            {lookupError && <Notice kind="error" role="alert">{lookupError}</Notice>}
            <GameList
              games={games}
              gameCount={chain.data?.gameCount ?? 0n}
              account={wallet.account}
              selectedId={selectedId}
              loading={chain.loading}
              onSelect={setSelectedId}
              onLookup={(id) => void lookup(id)}
              onRefresh={chain.refresh}
            />
          </div>
        </div>
      </main>
      <ContractsFooter deployment={deployment} />
    </>
  )
}
