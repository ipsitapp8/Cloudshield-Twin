import { useEffect, useState } from 'react'
import { api } from '../api/client'

const POLL_INTERVAL_MS = 3000

/** GET /twin's mode, polled independently of any provider so callers don't need to sit
 * under LiveProvider. Used to gate replay/incident controls: the backend rejects
 * /replay/* with 409 once a real agent has connected (STOP-spec: LIVE/DEMO/unconnected
 * never mixed), so those controls disable themselves instead of surfacing that 409 as a
 * confusing error. */
export function useAgentMode(): 'unconnected' | 'demo' | 'live' | undefined {
  const [mode, setMode] = useState<'unconnected' | 'demo' | 'live' | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      api
        .getTwin()
        .then((twin) => {
          if (!cancelled) setMode(twin.mode)
        })
        .catch(() => {})
    }
    poll()
    const id = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return mode
}
