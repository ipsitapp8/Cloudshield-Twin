import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'
import { Badge } from './Badge'

/** "Why is my VM slow?" (live-monitoring extension §6/§15), via GET /performance.
 * Demo/replay mode has no CPU/memory telemetry -- this says so plainly rather than
 * showing fabricated numbers (§26: every displayed fact must have a source). */
export function PerformancePanel() {
  const { messageCount } = useLive()
  const perf = useAsyncData(api.getPerformance, [messageCount])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Performance — Why is my VM slow?
        </h2>
        <button
          type="button"
          onClick={perf.refetch}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>
      <AsyncBoundary state={perf} onRetry={perf.refetch}>
        {(result) => {
          if (!result.available) {
            return (
              <p className="text-sm text-slate-500" data-testid="performance-unavailable">
                <Badge tone="DEMO">DEMO / REPLAY</Badge>{' '}
                {result.reason ?? 'No live telemetry available.'}
              </p>
            )
          }

          const observed = result.observed ?? {}
          return (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Source: <Badge tone={result.source === 'live' ? 'ok' : 'DEMO'}>{result.source.toUpperCase()}</Badge>
              </p>

              <div className="rounded border border-slate-800 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observed</p>
                <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300 sm:grid-cols-4">
                  {'cpu_percent' in observed && (
                    <div>
                      <dt className="text-slate-500">CPU</dt>
                      <dd className="font-mono">{String(observed.cpu_percent)}%</dd>
                    </div>
                  )}
                  {'memory_percent' in observed && (
                    <div>
                      <dt className="text-slate-500">Memory</dt>
                      <dd className="font-mono">{String(observed.memory_percent)}%</dd>
                    </div>
                  )}
                  {'swap_percent' in observed && (
                    <div>
                      <dt className="text-slate-500">Swap</dt>
                      <dd className="font-mono">{String(observed.swap_percent)}%</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded border border-purple-800 bg-purple-950/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">Conclusion</p>
                <p className="mt-1 text-sm text-slate-200" data-testid="performance-explanation">
                  {result.explanation}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Findings</p>
                <ul className="space-y-2">
                  {(result.findings ?? []).map((f) => (
                    <li key={f.type} className="rounded border border-slate-800 p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">{f.type}</span>
                        <Badge tone={f.confidence}>{f.confidence}</Badge>
                      </div>
                      <p className="mt-1 text-slate-400">{f.explanation}</p>
                      <ul className="mt-1 list-inside list-disc text-slate-500">
                        {f.evidence.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>

              {result.history && result.history.series.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">History (CPU %)</p>
                  {result.history.trend && <p className="mt-1 text-xs text-amber-300">{result.history.trend}</p>}
                  <table className="mt-1 w-full text-left text-xs text-slate-300">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="py-1 pr-2">Time</th>
                        <th className="py-1 pr-2">CPU %</th>
                        <th className="py-1 pr-2">Memory %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.history.series.map((s) => (
                        <tr key={s.ts} className="border-b border-slate-900">
                          <td className="py-1 pr-2 font-mono">{new Date(s.ts * 1000).toLocaleTimeString()}</td>
                          <td className="py-1 pr-2 font-mono">{s.cpu_percent}</td>
                          <td className="py-1 pr-2 font-mono">{s.memory_percent ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        }}
      </AsyncBoundary>
    </section>
  )
}
