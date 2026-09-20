import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { Badge } from './Badge'

/** Persistent, always-visible risk feedback -- not locked behind the Findings tab.
 * Reuses GET /fix/exposure-redis's already-computed candidates[0].before (the same
 * risk numbers FixPreviewPanel shows), so the app continuously answers "how exposed
 * am I right now" and visibly reacts to every replay step / apply / rollback. */
export function RiskBar() {
  const { messageCount } = useLive()
  const preview = useAsyncData(() => api.getFixPreview('exposure-redis'), [messageCount])

  if (preview.status !== 'success') {
    return (
      <div data-testid="risk-bar" className="flex items-center gap-2 text-xs text-slate-600">
        <span className="uppercase tracking-wide">Attack surface</span>
        <span>—</span>
      </div>
    )
  }

  const risk = preview.data.candidates[0]?.before
  const attackSurface = risk?.attack_surface
  const band = typeof risk?.band === 'string' ? risk.band : undefined

  return (
    <div data-testid="risk-bar" className="flex items-center gap-2 text-xs">
      <span className="uppercase tracking-wide text-slate-500">Attack surface</span>
      <span className="font-mono font-semibold text-slate-200">
        {attackSurface !== undefined ? String(attackSurface) : '—'}
      </span>
      {band && <Badge tone={band}>{band}</Badge>}
    </div>
  )
}
