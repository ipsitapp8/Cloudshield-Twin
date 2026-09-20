import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'

/** Requirement 5: SPOF view, via GET /spof (engine.failure.spof ranking). */
export function SpofPanel() {
  const { messageCount } = useLive()
  const spof = useAsyncData(api.getSpof, [messageCount])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Single Points of Failure
        </h2>
        <button
          type="button"
          onClick={spof.refetch}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>
      <AsyncBoundary state={spof} onRetry={spof.refetch} isEmpty={(d) => d.length === 0} emptyMessage="No ranked nodes.">
        {(ranking) => (
          <table className="w-full text-left text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-1 pr-2">Node</th>
                <th className="py-1 pr-2"># Endpoints failed</th>
                <th className="py-1 pr-2">Which endpoints</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.node} className="border-b border-slate-900">
                  <td className="py-1 pr-2 font-mono">{r.node}</td>
                  <td className="py-1 pr-2">{r.count}</td>
                  <td className="py-1 pr-2">{r.failed_endpoints.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncBoundary>
    </section>
  )
}
