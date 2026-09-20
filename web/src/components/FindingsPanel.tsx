import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'
import { FixPreviewPanel } from './FixPreviewPanel'

/** Requirement 2: exposure/findings view. The backend has no dedicated "list findings"
 * endpoint, so this reuses GET /twin (for the affected-service list) plus the existing
 * GET /fix/{finding_id} for each service/datastore node -- finding ids are the engine's
 * documented `exposure-<node>` scheme (engine/exposure.py), no new endpoint needed. */
export function FindingsPanel() {
  const { messageCount } = useLive()
  const twin = useAsyncData(api.getTwin, [messageCount])
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Exposure Findings
      </h2>
      <AsyncBoundary state={twin} onRetry={twin.refetch} isEmpty={(d) => d.nodes.length === 0}>
        {(graph) => {
          const candidates = graph.nodes.filter((n) => n.kind === 'service' || n.kind === 'datastore')
          if (candidates.length === 0) {
            return <p className="text-sm italic text-slate-500">No services in the current twin.</p>
          }
          return (
            <ul className="space-y-1">
              {candidates.map((node) => {
                const findingId = `exposure-${node.id}`
                const isOpen = expanded === findingId
                return (
                  <li key={node.id} className="rounded border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : findingId)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-900"
                      aria-expanded={isOpen}
                    >
                      <span>
                        <span className="font-mono">{node.id}</span>{' '}
                        <span className="text-xs text-slate-500">
                          ({node.kind}, port {node.ports.join(',') || '—'})
                        </span>
                      </span>
                      <span className="text-xs text-slate-500">{isOpen ? 'Hide' : 'Inspect'}</span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3">
                        <FixPreviewPanel findingId={findingId} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )
        }}
      </AsyncBoundary>
    </section>
  )
}
