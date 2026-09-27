import type { TxPhase } from '../hooks/useTx'
import { TxLink } from './AddressLink'

/**
 * Always-mounted transaction status. The polite region announces progress; the alert region
 * carries failures. Both stay in the DOM so screen readers announce updates reliably.
 */
export function TxStatus({ state, explorer, onDismiss }: { state: TxPhase; explorer: string; onDismiss(): void }) {
  const failed = state.phase === 'failed'
  return (
    <div className="tx-status">
      <div role="status" className={state.phase === 'idle' || failed ? 'sr-only' : `notice notice-${state.phase === 'confirmed' ? 'success' : 'info'}`}>
        {state.phase === 'wallet' && (
          <>
            <span className="spinner" aria-hidden="true" /> {state.label}: confirm in your wallet…
          </>
        )}
        {state.phase === 'pending' && (
          <>
            <span className="spinner" aria-hidden="true" /> {state.label}: pending, <TxLink hash={state.hash} explorer={explorer} />
          </>
        )}
        {state.phase === 'confirmed' && (
          <>
            <span aria-hidden="true">✓ </span>
            {state.label}: confirmed, <TxLink hash={state.hash} explorer={explorer} />{' '}
            <button type="button" className="btn btn-quiet btn-small" onClick={onDismiss}>
              Dismiss
            </button>
          </>
        )}
      </div>
      <div role="alert" className={failed ? 'notice notice-error' : 'sr-only'}>
        {failed && (
          <>
            <span aria-hidden="true">× </span>
            {state.label} failed. {state.error}{' '}
            {state.hash && (
              <>
                Transaction <TxLink hash={state.hash} explorer={explorer} />.{' '}
              </>
            )}
            <button type="button" className="btn btn-quiet btn-small" onClick={onDismiss}>
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  )
}
