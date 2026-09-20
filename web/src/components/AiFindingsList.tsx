import type { AttackResult, Finding } from '../api/types'
import { WarningTriangleIcon } from './icons'

function Bullet({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-950/60 text-red-400">
        <WarningTriangleIcon className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm text-slate-300">
        <span className="font-semibold text-slate-100">{label}</span> — {detail}
      </p>
    </li>
  )
}

/** Every bullet traces to a real field: Finding.evidence (GET /fix/{id}) and the
 * AttackResult (POST /simulate/attack) already fetched for the path visual --
 * nothing here is an invented finding. */
export function AiFindingsList({ finding, attack, port }: { finding: Finding; attack: AttackResult; port?: number }) {
  const target = Object.keys(attack.paths)[0]
  const targetPath = target ? attack.paths[target] : undefined
  const exposedEvidence = Object.entries(finding.evidence)
    .filter(([, ok]) => ok)
    .map(([layer]) => layer)

  return (
    <ul className="space-y-2">
      <Bullet
        label="Exposed service"
        detail={`${finding.node}${port ? ` (port ${port})` : ''} is reachable — evidence: ${
          exposedEvidence.join(', ') || 'none'
        }.`}
      />
      {targetPath && (
        <Bullet
          label="Lateral movement possible"
          detail={`Attacker can reach ${targetPath.path.slice(1, -1).join(', ') || target} from ${finding.node}.`}
        />
      )}
      <Bullet label="Blast radius" detail={`${attack.blast_radius} reachable asset(s).`} />
      {target && <Bullet label="Critical asset" detail={`${target} (reachable via this path).`} />}
    </ul>
  )
}
