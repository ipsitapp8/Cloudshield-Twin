import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'

/** Requirement 9: events/audit view, via GET /events. Auto-refreshes on WS activity
 * (drift events, patch apply/rollback, replay steps) -- requirement 12. */
export function EventsPanel() {
  const { messageCount } = useLive()
  const events = useAsyncData(() => api.getEvents(50), [messageCount])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Events</h2>
        <button
          type="button"
          onClick={events.refetch}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>
      <AsyncBoundary state={events} onRetry={events.refetch} isEmpty={(d) => d.length === 0} emptyMessage="No events yet.">
        {(list) => (
          <ul className="space-y-1 text-xs">
            {list.map((e) => (
              <li key={e.id} className="rounded border border-slate-800 p-2">
                <span className="font-mono text-slate-500">{new Date(e.ts * 1000).toLocaleTimeString()}</span>{' '}
                <span className="font-semibold text-slate-200">{e.type}</span>
                <pre className="mt-1 overflow-x-auto text-[11px] text-slate-400">
                  {JSON.stringify(e.payload)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </section>
  )
}
