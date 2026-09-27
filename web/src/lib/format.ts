import { formatUnits, parseUnits, type Address } from 'viem'

/** Formats a token amount with digit grouping and at most `maxFraction` decimals (trailing zeros trimmed). */
export function formatAmount(value: bigint, decimals: number, maxFraction = 4): string {
  const negative = value < 0n
  const text = formatUnits(negative ? -value : value, decimals)
  const [whole, fraction = ''] = text.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '')
  const shownFraction = trimmed.length > 0 ? `.${trimmed}` : ''
  // Say when a nonzero amount rounds to nothing rather than showing a misleading 0.
  if (value !== 0n && grouped === '0' && trimmed.length === 0) return `${negative ? '-' : ''}<0.${'0'.repeat(maxFraction - 1)}1`
  return `${negative ? '-' : ''}${grouped}${shownFraction}`
}

export interface ParsedAmount {
  value: bigint | null
  error: string | null
}

/** Parses a decimal string typed by the visitor into token minor units. */
export function parseAmount(input: string, decimals: number): ParsedAmount {
  const text = input.trim().replace(/,/g, '')
  if (text.length === 0) return { value: null, error: 'Enter an amount.' }
  if (!/^\d*\.?\d*$/.test(text) || text === '.') return { value: null, error: 'Use digits and at most one decimal point.' }
  const [, fraction = ''] = text.split('.')
  if (fraction.length > decimals) return { value: null, error: `Use at most ${decimals} decimal places.` }
  try {
    return { value: parseUnits(text, decimals), error: null }
  } catch {
    return { value: null, error: 'Enter a valid amount.' }
  }
}

export function shortAddress(address: Address | string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

/** mm:ss, or h:mm:ss above an hour. Negative values clamp to 0:00. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
