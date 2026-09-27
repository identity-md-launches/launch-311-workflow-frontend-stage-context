import { useEffect, useState } from 'react'

/**
 * Estimates the chain's current timestamp: the latest block's timestamp plus the wall-clock time
 * elapsed since it was fetched. Re-renders once a second so countdowns tick.
 */
export function useChainNow(blockTimestamp: number | undefined, fetchedAt: number | undefined): number | null {
  const [wall, setWall] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setWall(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  if (blockTimestamp === undefined || fetchedAt === undefined) return null
  return blockTimestamp + Math.max(0, Math.floor((wall - fetchedAt) / 1000))
}
