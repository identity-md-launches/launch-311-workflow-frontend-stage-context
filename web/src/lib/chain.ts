import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
import type { Deployment } from '../config'
import type { Eip1193Provider } from './wallet'

/**
 * Reads go through the manifest's public RPC URLs in order, batched per tick, with the connected
 * wallet's provider as a last resort. Nothing here can sign.
 */
export function makePublicClient(deployment: Deployment, walletProvider: Eip1193Provider | null): PublicClient {
  const transports: Transport[] = deployment.network.rpcUrls.map((url) => http(url, { batch: { batchSize: 25, wait: 16 }, timeout: 15_000 }))
  if (walletProvider) transports.push(custom(walletProvider))
  return createPublicClient({
    chain: deployment.chain,
    transport: fallback(transports, { rank: false }),
    pollingInterval: 4_000,
  })
}

/** Signing stays in the visitor's wallet; this client only forwards requests to it. */
export function makeWalletClient(chain: Chain, provider: Eip1193Provider, account: Address): WalletClient {
  return createWalletClient({ chain, account, transport: custom(provider) })
}
