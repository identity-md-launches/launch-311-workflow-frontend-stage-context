import type { Address, PublicClient } from 'viem'
import { LAUNCH_POOL, type Deployment } from '../config'

/** Uniswap v4 quoter surface used for the read-only pool rate. */
export const QUOTER_ABI = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

export interface PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

/** The launch pool: paired currency (native ETH = zero address) against NGHT, sorted ascending. */
export function launchPoolKey(token: Address): PoolKey {
  const paired = LAUNCH_POOL.pairedCurrency
  const sorted = BigInt(paired) < BigInt(token) ? [paired, token] : [token, paired]
  return { currency0: sorted[0], currency1: sorted[1], fee: LAUNCH_POOL.fee, tickSpacing: LAUNCH_POOL.tickSpacing, hooks: LAUNCH_POOL.hooks }
}

/**
 * Quotes how much NGHT `amountInWei` of the paired currency buys right now, through the quoter
 * named in the manifest's network block. A simulation, never a transaction.
 */
export async function quotePairedToToken(client: PublicClient, deployment: Deployment, amountInWei: bigint): Promise<bigint> {
  const poolKey = launchPoolKey(deployment.token.address)
  const zeroForOne = poolKey.currency1.toLowerCase() === deployment.token.address.toLowerCase()
  const { result } = await client.simulateContract({
    address: deployment.network.uniswapV4.quoter,
    abi: QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{ poolKey, zeroForOne, exactAmount: amountInWei, hookData: '0x' }],
  })
  return result[0]
}
