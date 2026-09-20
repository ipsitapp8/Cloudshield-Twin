import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'

/** Raw process/listening-port explorer, straight from the connected agent's
 * telemetry (GET /processes) -- no summarizing, no invented columns. */
export function ProcessesPanel() {
  const { messageCount } = useLive()
  const data = useAsyncData(api.getProcesses, [messageCount])

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Processes &amp; Listening Ports</h2>
        <button
          type="button"
          onClick={data.refetch}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>
      <AsyncBoundary state={data} onRetry={data.refetch}>
        {(result) => {
          if (!result.available) {
            return (
              <p className="text-sm italic text-slate-500" data-testid="processes-unavailable">
                No telemetry available yet.
              </p>
            )
          }

          const processes = result.processes ?? []
          const listeners = result.listeners ?? []

          return (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Processes</p>
                {processes.length === 0 ? (
                  <p className="text-sm italic text-slate-500">No processes reported.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="pb-1 pr-2 font-medium">PID</th>
                        <th className="pb-1 pr-2 font-medium">NAME</th>
                        <th className="pb-1 pr-2 font-medium">CPU</th>
                        <th className="pb-1 font-medium">MEMORY</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {processes.map((p, i) => (
                        <tr key={`${p.pid}-${i}`} className="border-t border-slate-800">
                          <td className="py-1 pr-2 font-mono">{p.pid ?? '—'}</td>
                          <td className="py-1 pr-2">{p.name}</td>
                          <td className="py-1 pr-2 font-mono">{p.cpu_percent != null ? `${p.cpu_percent.toFixed(1)}%` : '—'}</td>
                          <td className="py-1 font-mono">{p.memory_percent != null ? `${p.memory_percent.toFixed(1)}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Listening Ports</p>
                {listeners.length === 0 ? (
                  <p className="text-sm italic text-slate-500">No listening ports reported.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="pb-1 pr-2 font-medium">ADDRESS</th>
                        <th className="pb-1 pr-2 font-medium">PORT</th>
                        <th className="pb-1 font-medium">PROCESS</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {listeners.map((l, i) => (
                        <tr key={`${l.bind}-${l.port}-${i}`} className="border-t border-slate-800">
                          <td className="py-1 pr-2 font-mono">{l.bind}</td>
                          <td className="py-1 pr-2 font-mono">{l.port}</td>
                          <td className="py-1">{l.proc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )
        }}
      </AsyncBoundary>
    </section>
  )
}
