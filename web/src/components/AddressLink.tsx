import type { Address } from 'viem'
import { shortAddress } from '../lib/format'

/** Explorer link for an address, showing a short form with the full address as the accessible name. */
export function AddressLink({ address, explorer, label, full = false }: { address: Address | string; explorer: string; label?: string; full?: boolean }) {
  const text = full ? address : shortAddress(address)
  return (
    <a className="mono address" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer" aria-label={`${label ? `${label} ` : ''}${address} on the block explorer, opens in a new tab`}>
      {text}
    </a>
  )
}

export function TxLink({ hash, explorer }: { hash: string; explorer: string }) {
  return (
    <a className="mono" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer" aria-label={`Transaction ${hash} on the block explorer, opens in a new tab`}>
      {shortAddress(hash)}
    </a>
  )
}
