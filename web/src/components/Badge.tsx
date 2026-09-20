const COLORS: Record<string, string> = {
  // exposure statuses
  exposed: 'bg-red-900 text-red-200 border-red-700',
  latent: 'bg-amber-900 text-amber-200 border-amber-700',
  internal: 'bg-sky-900 text-sky-200 border-sky-700',
  closed: 'bg-slate-800 text-slate-300 border-slate-600',
  // node / service states
  ok: 'bg-emerald-900 text-emerald-200 border-emerald-700',
  degraded: 'bg-amber-900 text-amber-200 border-amber-700',
  down: 'bg-red-900 text-red-200 border-red-700',
  compromised: 'bg-fuchsia-900 text-fuchsia-200 border-fuchsia-700',
  // endpoint statuses
  FAILED: 'bg-red-900 text-red-200 border-red-700',
  DEGRADED: 'bg-amber-900 text-amber-200 border-amber-700',
  OK: 'bg-emerald-900 text-emerald-200 border-emerald-700',
  // probe
  reachable: 'bg-red-900 text-red-200 border-red-700',
  unreachable: 'bg-emerald-900 text-emerald-200 border-emerald-700',
  unknown: 'bg-slate-800 text-slate-300 border-slate-600',
  // risk bands
  LOW: 'bg-emerald-900 text-emerald-200 border-emerald-700',
  MED: 'bg-amber-900 text-amber-200 border-amber-700',
  HIGH: 'bg-red-900 text-red-200 border-red-700',
}

export function Badge({ children, tone }: { children: string; tone?: string }) {
  const cls = COLORS[tone ?? children] ?? 'bg-slate-800 text-slate-300 border-slate-600'
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}
