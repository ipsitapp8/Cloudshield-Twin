import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'
import { Badge } from './Badge'
import { FlowGraph } from './FlowGraph'
import { GettingStartedBanner } from './GettingStartedBanner'

/** Requirement 1: Dashboard showing the current twin/topology, from GET /twin.
 * Auto-refreshes whenever the WebSocket reports a change (ingest, replay step, patch applied). */
export function TwinDashboard() {
  const { messageCount } = useLive()
  const twin = useAsyncData(api.getTwin, [messageCount])

  return (
    <section className="space-y-3">
      <GettingStartedBanner />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Twin Topology
        </h2>
        <button
          type="button"
          onClick={twin.refetch}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>
      <AsyncBoundary state={twin} onRetry={twin.refetch} isEmpty={(d) => d.nodes.length === 0}>
        {(graph) => (
          <>
            <FlowGraph graph={graph} />
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="py-1 pr-2">Node</th>
                  <th className="py-1 pr-2">Kind</th>
                  <th className="py-1 pr-2">Ports</th>
                  <th className="py-1 pr-2">Sensitivity</th>
                  <th className="py-1 pr-2">State</th>
                </tr>
              </thead>
              <tbody>
                {graph.nodes.map((n) => (
                  <tr key={n.id} className="border-b border-slate-900">
                    <td className="py-1 pr-2 font-mono">{n.id}</td>
                    <td className="py-1 pr-2">{n.kind}</td>
                    <td className="py-1 pr-2">{n.ports.join(', ') || '—'}</td>
                    <td className="py-1 pr-2">{n.sensitivity}</td>
                    <td className="py-1 pr-2">
                      <Badge tone={n.state}>{n.state}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </AsyncBoundary>
    </section>
  )
}
