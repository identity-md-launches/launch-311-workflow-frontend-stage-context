import type { Deployment } from '../config'
import { AddressLink } from './AddressLink'

/** Every configured address with an explorer link, straight from the runtime manifest. */
export function ContractsFooter({ deployment }: { deployment: Deployment }) {
  const { manifest, network } = deployment
  return (
    <footer className="site-footer">
      <h2 id="contracts-heading">Contracts and network</h2>
      <dl className="stats stats-inline" aria-labelledby="contracts-heading">
        {deployment.contracts.map((c) => (
          <div key={c.name}>
            <dt>{c.name}</dt>
            <dd>
              <AddressLink address={c.address} explorer={network.explorer} label={c.name} full />
            </dd>
          </div>
        ))}
        <div>
          <dt>Network</dt>
          <dd>
            {network.name} (chain id <span className="num">{network.chainId}</span>){network.testnet ? ', a test network' : ''}
          </dd>
        </div>
        <div>
          <dt>Uniswap v4 quoter</dt>
          <dd>
            <AddressLink address={network.uniswapV4.quoter} explorer={network.explorer} label="Uniswap v4 quoter" full />
          </dd>
        </div>
        <div>
          <dt>Source commit</dt>
          <dd className="mono">{manifest.sourceCommit}</dd>
        </div>
        <div>
          <dt>Launch id</dt>
          <dd className="mono">{manifest.launchId}</dd>
        </div>
      </dl>
      <p className="muted">
        Reads use the public RPC endpoints listed in the deployment manifest; transactions are signed only in your wallet. This is a
        Sepolia test game with no real value.
      </p>
    </footer>
  )
}
