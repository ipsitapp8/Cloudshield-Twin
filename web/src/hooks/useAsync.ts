import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: T }

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

/** Fetches on mount and whenever `deps` changes; exposes a manual `refetch`. */
export function useAsyncData<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const fnRef = useRef(fn)
  fnRef.current = fn

  const refetch = useCallback(() => {
    setState({ status: 'loading' })
    fnRef.current().then(
      (data) => setState({ status: 'success', data }),
      (error) => setState({ status: 'error', error: toError(error) }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ...state, refetch }
}

/** Manually-triggered async action (button clicks) with loading/error/success state. */
export function useAsyncAction<Args extends unknown[], T>(fn: (...args: Args) => Promise<T>) {
  const [state, setState] = useState<AsyncState<T> | { status: 'idle' }>({ status: 'idle' })

  const run = useCallback(
    async (...args: Args) => {
      setState({ status: 'loading' })
      try {
        const data = await fn(...args)
        setState({ status: 'success', data })
        return data
      } catch (error) {
        setState({ status: 'error', error: toError(error) })
        throw error
      }
    },
    [fn],
  )

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, run, reset }
}
