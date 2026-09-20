import type { NodeKind } from '../api/types'
import { ArrowDownIcon, DatabaseIcon, GlobeIcon, NetworkIcon, ServerIcon, ShieldIcon, WarningTriangleIcon } from './icons'

const ICON_BY_KIND: Record<NodeKind, (p: { className?: string }) => React.ReactElement> = {
  internet: GlobeIcon,
  host: ServerIcon,
  service: NetworkIcon,
  datastore: DatabaseIcon,
  imds: ShieldIcon,
  aws_role: ShieldIcon,
  aws_bucket: DatabaseIcon,
}

export interface CascadeNodeInfo {
  kind: NodeKind
}

/** Vertical read of the same real attack path AttackPathVisual draws horizontally --
 * one POST /simulate/attack result, two presentations. */
export function AttackCascadeList({
  path,
  nodes,
  target,
  blastRadius,
}: {
  path: string[]
  nodes: Record<string, CascadeNodeInfo>
  target: string
  blastRadius: number
}) {
  const steps = path.slice(1) // skip "internet" -- the entry point isn't itself "reachable"
  return (
    <div className="space-y-1">
      {steps.map((id, i) => {
        const info = nodes[id]
        const Icon = info ? ICON_BY_KIND[info.kind] : ServerIcon
        const label = i === 0 ? `${id} compromised` : `${id} reachable`
        return (
          <div key={id}>
            <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  i === 0 ? 'bg-red-950/70 text-red-400' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <p className="text-sm text-slate-200">{label}</p>
            </div>
            {i < steps.length - 1 && (
              <div className="flex justify-center py-0.5">
                <ArrowDownIcon className="h-3.5 w-3.5 text-slate-600" />
              </div>
            )}
          </div>
        )
      })}

      <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/30 p-3">
        <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div>
          <p className="text-sm font-semibold text-red-200">{target} potentially exposed</p>
          <p className="text-xs text-red-300/80">
            Blast radius: {blastRadius} service(s) &nbsp;|&nbsp; Critical asset: {target}
          </p>
        </div>
      </div>
    </div>
  )
}
