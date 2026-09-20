import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncAction, useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'
import { Badge } from './Badge'

/** Requirement 3: failure simulation controls, via POST /simulate/failure. */
export function FailurePanel() {
  const { messageCount } = useLive()
  const twin = useAsyncData(api.getTwin, [messageCount])
  const [node, setNode] = useState('')
  const failure = useAsyncAction(api.simulateFailure)

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Failure Simulation
      </h2>
      <AsyncBoundary state={twin} onRetry={twin.refetch} isEmpty={(d) => d.nodes.length === 0}>
        {(graph) => (
          <div className="flex items-center gap-2">
            <select
              value={node}
              onChange={(e) => setNode(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              aria-label="node to fail"
            >
              <option value="">Select a node…</option>
              {graph.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!node || failure.state.status === 'loading'}
              onClick={() => failure.run(node).catch(() => {})}
              className="rounded bg-purple-700 px-3 py-1 text-xs font-medium text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Simulate Failure
            </button>
          </div>
        )}
      </AsyncBoundary>

      {failure.state.status === 'loading' && (
        <p role="status" className="text-sm text-slate-400">
          Simulating…
        </p>
      )}
      {failure.state.status === 'error' && (
        <p role="alert" className="text-sm text-red-400">
          {failure.state.error.message}
        </p>
      )}
      {failure.state.status === 'success' && (
        <div className="space-y-3 rounded border border-slate-800 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { key: 'services', label: 'Affected services', value: Object.keys(failure.state.data.affected_services).length },
              { key: 'endpoints', label: 'Affected endpoints', value: Object.keys(failure.state.data.affected_endpoints).length },
              { key: 'paths', label: 'Critical paths', value: Object.keys(failure.state.data.critical_paths).length },
              { key: 'recovery', label: 'Recovery first', value: failure.state.data.recovery_order[0] ?? '—' },
            ].map((stat) => (
              <div
                key={stat.key}
                data-testid={`failure-stat-${stat.key}`}
                className="rounded border border-slate-800 bg-slate-900/60 p-2 text-center"
              >
                <p className="font-mono text-lg font-bold text-slate-100">{stat.value}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Affected services</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {Object.entries(failure.state.data.affected_services).map(([svc, state]) => (
                <li key={svc} className="text-xs">
                  <span className="font-mono">{svc}</span> <Badge tone={state}>{state}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Affected endpoints</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {Object.entries(failure.state.data.affected_endpoints).map(([ep, status]) => (
                <li key={ep} className="text-xs">
                  <span className="font-mono">{ep}</span> <Badge tone={status}>{status}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Recovery order</p>
            <p className="mt-1 text-xs text-slate-300">
              {failure.state.data.recovery_order.join(' → ') || '—'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
