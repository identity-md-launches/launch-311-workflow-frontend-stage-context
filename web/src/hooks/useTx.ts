import { useCallback, useState } from 'react'
import type { Hash, PublicClient } from 'viem'
import { describeError } from '../lib/errors'

export type TxPhase =
  | { phase: 'idle' }
  | { phase: 'wallet'; label: string }
  | { phase: 'pending'; label: string; hash: Hash }
  | { phase: 'confirmed'; label: string; hash: Hash }
  | { phase: 'failed'; label: string; error: string; hash?: Hash }

export interface TxRunner {
  state: TxPhase
  busy: boolean
  run(label: string, send: () => Promise<Hash>): Promise<boolean>
  dismiss(): void
}

/** Runs one transaction at a time: wallet prompt, pending, confirmed or failed, then refreshes reads. */
export function useTx(client: PublicClient, onSettled: () => void): TxRunner {
  const [state, setState] = useState<TxPhase>({ phase: 'idle' })
  const busy = state.phase === 'wallet' || state.phase === 'pending'

  const run = useCallback(
    async (label: string, send: () => Promise<Hash>) => {
      setState({ phase: 'wallet', label })
      let hash: Hash | undefined
      try {
        hash = await send()
        setState({ phase: 'pending', label, hash })
        const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 })
        if (receipt.status !== 'success') {
          setState({ phase: 'failed', label, hash, error: 'The transaction was mined but reverted.' })
          return false
        }
        setState({ phase: 'confirmed', label, hash })
        return true
      } catch (e) {
        setState({ phase: 'failed', label, hash, error: describeError(e) })
        return false
      } finally {
        onSettled()
      }
    },
    [client, onSettled],
  )

  const dismiss = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, busy, run, dismiss }
}
