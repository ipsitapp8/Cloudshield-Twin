import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAsyncData } from '../hooks/useAsync'
import { useCountUp } from '../hooks/useCountUp'
import { useLive } from '../hooks/LiveContext'
import { Badge } from './Badge'

/** Persistent, always-visible risk feedback -- not locked behind the Findings tab.
 * Reuses GET /fix/exposure-redis's already-computed candidates[0].before (the same
 * risk numbers FixPreviewPanel shows), so the app continuously answers "how exposed
 * am I right now" and visibly reacts to every replay step / apply / rollback. */
export function RiskBar() {
  const { messageCount } = useLive()
  const preview = useAsyncData(() => api.getFixPreview('exposure-redis'), [messageCount])

  const risk = preview.status === 'success' ? preview.data.candidates[0]?.before : undefined
  const attackSurface = typeof risk?.attack_surface === 'number' ? risk.attack_surface : undefined
  const band = typeof risk?.band === 'string' ? risk.band : undefined
  const animatedSurface = useCountUp(attackSurface)

  const [flash, setFlash] = useState(false)
  const prevBand = useRef(band)
  useEffect(() => {
    if (band && prevBand.current && band !== prevBand.current) {
      setFlash(true)
      const timer = setTimeout(() => setFlash(false), 700)
      prevBand.current = band
      return () => clearTimeout(timer)
    }
    prevBand.current = band
  }, [band])

  return (
    <div
      data-testid="risk-bar"
      className={`flex items-center gap-2 px-1 text-xs ${flash ? 'animate-ring-flash' : ''}`}
    >
      <span className="uppercase tracking-wide text-slate-500">Attack surface</span>
      <span className="font-mono font-semibold text-slate-200">
        {attackSurface !== undefined ? String(animatedSurface ?? attackSurface) : '—'}
      </span>
      {band && <Badge tone={band}>{band}</Badge>}
    </div>
  )
}
