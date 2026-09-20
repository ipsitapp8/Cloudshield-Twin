import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'

/** Distinguishes real live-agent telemetry from demo/replay fixtures (the live-
 * monitoring pivot's core requirement: never let a user mistake one for the other).
 * Reads GET /twin's mode/connected/last_seen_seconds_ago fields -- no new endpoint. */
export function AgentStatusBadge() {
  const { messageCount } = useLive()
  const twin = useAsyncData(api.getTwin, [messageCount])

  if (twin.status !== 'success') {
    return null
  }

  const mode = twin.data.mode ?? 'unconnected'
  const connected = twin.data.connected ?? false
  const lastSeen = twin.data.last_seen_seconds_ago

  if (mode === 'unconnected') {
    return (
      <span
        data-testid="agent-status"
        className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-500"
      >
        <span className="h-2 w-2 rounded-full bg-slate-600" aria-hidden="true" />
        NO VM CONNECTED
      </span>
    )
  }

  if (mode === 'demo') {
    return (
      <span
        data-testid="agent-status"
        className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-400"
      >
        <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden="true" />
        DEMO / REPLAY
      </span>
    )
  }

  return (
    <span
      data-testid="agent-status"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
        connected ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-amber-700 bg-amber-950/40 text-amber-300'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden="true" />
      {connected ? 'LIVE ●' : 'LIVE (stale)'}
      {lastSeen != null && <span className="text-slate-500">· last seen {Math.round(lastSeen)}s ago</span>}
    </span>
  )
}
