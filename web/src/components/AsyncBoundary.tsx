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
      <div role="status" className="flex items-center gap-2 py-2 text-sm text-slate-500">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-700 border-t-purple-500" />
        Loading…
      </div>
    )
  }

  if (state.status === 'error') {
    const backendDown = state.error instanceof BackendUnavailableError
    return (
      <div role="alert" className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-red-300">
          <span aria-hidden="true">⚠</span>
          {backendDown ? 'Backend unavailable' : 'Request failed'}
        </p>
        <p className="mt-1 text-red-200/70">{state.error.message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded border border-red-800 px-3 py-1 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/40"
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
