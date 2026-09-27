import { useCallback, useEffect, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { GAME_LIST_LIMIT, QUOTE_SAMPLE_WEI, type Deployment } from '../config'
import type { GameRecord } from '../lib/game'
import { quotePairedToToken } from '../lib/uniswap'

export interface AccountState {
  balance: bigint
  allowance: bigint
  withdrawable: bigint
}

export interface ChainSnapshot {
  blockNumber: bigint
  blockTimestamp: number
  fetchedAt: number
  gameCount: bigint
  games: GameRecord[]
  account: AccountState | null
  quote: { amountIn: bigint; amountOut: bigint } | { error: string } | null
}

export interface ChainState {
  data: ChainSnapshot | null
  loading: boolean
  error: string | null
  refresh(): void
  lookup(id: bigint): Promise<GameRecord>
}

type RawGame = {
  playerX: Address
  stake: bigint
  playerO: Address
  moveDeadline: number
  board: number
  status: number
  turn: number
}

async function readGame(client: PublicClient, deployment: Deployment, id: bigint): Promise<GameRecord> {
  const raw = (await client.readContract({
    address: deployment.game.address,
    abi: deployment.game.abi,
    functionName: 'game',
    args: [id],
  })) as RawGame
  return {
    id,
    playerX: raw.playerX,
    stake: BigInt(raw.stake),
    playerO: raw.playerO,
    moveDeadline: Number(raw.moveDeadline),
    board: Number(raw.board),
    status: Number(raw.status),
    turn: Number(raw.turn),
  }
}

/** Polls contract views: block time, the newest games, and the connected wallet's balances. */
export function useChainState(client: PublicClient, deployment: Deployment, account: Address | null, pollMs: number): ChainState {
  const [data, setData] = useState<ChainSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [block, gameCount] = await Promise.all([
          client.getBlock({ blockTag: 'latest' }),
          client.readContract({ address: deployment.game.address, abi: deployment.game.abi, functionName: 'gameCount' }) as Promise<bigint>,
        ])
        const first = gameCount > BigInt(GAME_LIST_LIMIT) ? gameCount - BigInt(GAME_LIST_LIMIT) : 0n
        const ids: bigint[] = []
        for (let id = gameCount - 1n; id >= first; id--) ids.push(id)
        const [games, accountState, quote] = await Promise.all([
          Promise.all(ids.map((id) => readGame(client, deployment, id))),
          account
            ? Promise.all([
                client.readContract({ address: deployment.token.address, abi: deployment.token.abi, functionName: 'balanceOf', args: [account] }) as Promise<bigint>,
                client.readContract({
                  address: deployment.token.address,
                  abi: deployment.token.abi,
                  functionName: 'allowance',
                  args: [account, deployment.game.address],
                }) as Promise<bigint>,
                client.readContract({ address: deployment.game.address, abi: deployment.game.abi, functionName: 'withdrawable', args: [account] }) as Promise<bigint>,
              ]).then(([balance, allowance, withdrawable]) => ({ balance, allowance, withdrawable }))
            : Promise.resolve(null),
          quotePairedToToken(client, deployment, QUOTE_SAMPLE_WEI)
            .then((amountOut) => ({ amountIn: QUOTE_SAMPLE_WEI, amountOut }))
            .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
        ])
        if (cancelled) return
        setData({
          blockNumber: block.number,
          blockTimestamp: Number(block.timestamp),
          fetchedAt: Date.now(),
          gameCount,
          games,
          account: accountState,
          quote,
        })
        setError(null)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    setLoading(true)
    void load()
    const timer = window.setInterval(() => void load(), pollMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [client, deployment, account, pollMs, tick])

  const lookup = useCallback((id: bigint) => readGame(client, deployment, id), [client, deployment])

  return { data, loading, error, refresh, lookup }
}
