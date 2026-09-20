import type { NodeKind } from '../api/types'
import { ArrowRightIcon, DatabaseIcon, GlobeIcon, NetworkIcon, ServerIcon, ShieldIcon } from './icons'

const ICON_BY_KIND: Record<NodeKind, (p: { className?: string }) => React.ReactElement> = {
  internet: GlobeIcon,
  host: ServerIcon,
  service: NetworkIcon,
  datastore: DatabaseIcon,
  imds: ShieldIcon,
  aws_role: ShieldIcon,
  aws_bucket: DatabaseIcon,
}

export interface PathNodeInfo {
  kind: NodeKind
  ports: number[]
}

/** Horizontal icon-node row for a real POST /simulate/attack path. The `riskyNodeId`
 * (the compromised/entry service) is ringed in red with a "High Risk Path" label
 * spanning the segment from it onward -- plain CSS, no graph-drawing dependency. */
export function AttackPathVisual({
  path,
  nodes,
  riskyNodeId,
}: {
  path: string[]
  nodes: Record<string, PathNodeInfo>
  riskyNodeId?: string
}) {
  const riskyIndex = riskyNodeId ? path.indexOf(riskyNodeId) : -1

  return (
    <div className="overflow-x-auto py-6">
      <div className="relative flex min-w-max items-start gap-1">
        {riskyIndex >= 0 && (
          <div
            className="absolute -top-2 flex items-center justify-center"
            style={{ left: `${riskyIndex * 6.5}rem`, width: `${(path.length - riskyIndex) * 6.5}rem` }}
          >
            <span className="rounded-full border border-red-600 bg-red-950/80 px-2 py-0.5 text-[10px] font-semibold text-red-300">
              High Risk Path
            </span>
          </div>
        )}
        {path.map((id, i) => {
          const info = nodes[id]
          const Icon = info ? ICON_BY_KIND[info.kind] : ServerIcon
          const isRisky = id === riskyNodeId
          return (
            <div key={id} className="flex items-start">
              <div className="flex w-24 flex-col items-center gap-1.5 pt-4 text-center">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${
                    isRisky
                      ? 'border-red-500 bg-red-950/60 text-red-300 shadow-[0_0_0_4px_rgba(239,68,68,0.15)]'
                      : 'border-slate-700 bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium text-slate-200">{id}</p>
                {info && info.ports.length > 0 && (
                  <p className="font-mono text-[10px] text-slate-500">:{info.ports.join(',')}</p>
                )}
              </div>
              {i < path.length - 1 && (
                <ArrowRightIcon className={`mt-8 h-4 w-4 shrink-0 ${isRisky ? 'text-red-500' : 'text-slate-600'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
