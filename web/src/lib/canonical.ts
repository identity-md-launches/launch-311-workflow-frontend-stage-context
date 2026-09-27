import { keccak256, stringToBytes } from 'viem'

/**
 * Canonical JSON: object keys sorted, no whitespace. This is the serialization whose
 * keccak-256 the deployment handoff records as `abiHash` for each contract ABI.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`
}

/** Lowercase hex keccak-256 of the canonical JSON, without a 0x prefix. */
export function canonicalKeccak(value: unknown): string {
  return keccak256(stringToBytes(canonicalJson(value))).slice(2)
}
