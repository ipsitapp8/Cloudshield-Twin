import type { ReactNode } from 'react'
import type { AsyncState } from '../hooks/useAsync'
import { BackendUnavailableError } from '../api/client'

interface Props<T> {
  state: AsyncState<T>
  onRetry?: () => void
  isEmpty?: (data: T) => boolean
  emptyMessage?: string
  children: (data: T) => ReactNode
}

/** Renders loading / error (backend-unavailable vs. request-failed) / empty / success
 * uniformly, so every panel handles all four states the same way. */
export function AsyncBoundary<T>({
  state,
  onRetry,
  isEmpty,
  emptyMessage = 'No data.',
  children,
}: Props<T>) {
  if (state.status === 'loading') {
    return (
      <div role="status" className="animate-pulse text-sm text-slate-400">
        Loading…
      </div>
    )
  }

  if (state.status === 'error') {
    const backendDown = state.error instanceof BackendUnavailableError
    return (
      <div role="alert" className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
        <p className="font-semibold">{backendDown ? 'Backend unavailable' : 'Request failed'}</p>
        <p className="mt-1 text-red-200/80">{state.error.message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded bg-red-800 px-2 py-1 text-xs font-medium text-red-50 hover:bg-red-700"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (isEmpty?.(state.data)) {
    return <div className="text-sm italic text-slate-500">{emptyMessage}</div>
  }

  return <>{children(state.data)}</>
}
