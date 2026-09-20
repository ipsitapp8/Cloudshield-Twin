import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { useAsyncAction, useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'
import { Badge } from './Badge'
import { FlowGraph } from './FlowGraph'
import { edgeKey } from '../lib/graphLayout'

const ENTRY_TYPES = ['public_service', 'compromised_service', 'stolen_credential', 'malicious_process']

/** Requirement 4: attack-path visualization built entirely from POST /simulate/attack
 * results (no client-side attack-graph computation -- engine/attack.py owns that). */
export function AttackPanel() {
  const { messageCount } = useLive()
  const twin = useAsyncData(api.getTwin, [messageCount])
  const [entryType, setEntryType] = useState(ENTRY_TYPES[0])
  const [node, setNode] = useState('internet')
  const attack = useAsyncAction(({ entryType, node }: { entryType: string; node: string }) =>
    api.simulateAttack(entryType, node),
  )

  const highlight = useMemo(() => {
    if (attack.state.status !== 'success') return undefined
    const nodeIds = new Set<string>()
    const edgeKeys = new Set<string>()
    const edgeMitre = new Map<string, string[]>()
    for (const target of Object.values(attack.state.data.paths)) {
      target.path.forEach((id) => nodeIds.add(id))
      for (let i = 0; i < target.path.length - 1; i++) {
        const key = edgeKey(target.path[i], target.path[i + 1])
        edgeKeys.add(key)
        edgeMitre.set(key, target.mitre)
      }
    }
    return { nodeIds, edgeKeys, edgeMitre }
  }, [attack.state])

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Attack Path Simulation
      </h2>
      <AsyncBoundary state={twin} onRetry={twin.refetch} isEmpty={(d) => d.nodes.length === 0}>
        {(graph) => (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              aria-label="entry type"
            >
              {ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={node}
              onChange={(e) => setNode(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              aria-label="entry node"
            >
              {graph.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={attack.state.status === 'loading'}
              onClick={() => attack.run({ entryType, node }).catch(() => {})}
              className="rounded bg-red-800 px-3 py-1 text-xs font-medium text-red-50 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Simulate Attack
            </button>
          </div>
        )}
      </AsyncBoundary>

      {attack.state.status === 'error' && (
        <p role="alert" className="text-sm text-red-400">
          {attack.state.error.message}
        </p>
      )}

      {attack.state.status === 'success' && twin.status === 'success' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Blast radius: <span className="font-mono">{attack.state.data.blast_radius}</span> reachable
            asset(s). All paths are <Badge tone="down">potential</Badge> only, never executed.
          </p>
          <FlowGraph graph={twin.data} highlight={highlight} />
          <ul className="space-y-1">
            {Object.entries(attack.state.data.paths).map(([target, p]) => (
              <li key={target} className="rounded border border-slate-800 p-2 text-xs">
                <span className="font-mono">{p.path.join(' → ')}</span>
                <div className="mt-1 flex gap-2 text-slate-400">
                  <span>hops: {p.hops}</span>
                  {p.mitre.map((id) => (
                    <Badge key={id} tone="down">
                      {id}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
            {Object.keys(attack.state.data.paths).length === 0 && (
              <li className="text-xs italic text-slate-500">No path to any sensitive asset found.</li>
            )}
          </ul>
        </div>
      )}
    </section>
  )
}
