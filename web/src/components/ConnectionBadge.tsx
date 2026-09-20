import { useLive } from '../hooks/LiveContext'

const LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  open: 'Live',
  closed: 'Disconnected',
  error: 'Connection error',
}

const DOT: Record<string, string> = {
  connecting: 'bg-amber-400',
  open: 'bg-emerald-400',
  closed: 'bg-slate-500',
  error: 'bg-red-500',
}

export function ConnectionBadge() {
  const { connectionState } = useLive()
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300"
      data-testid="connection-badge"
      data-state={connectionState}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[connectionState]}`} aria-hidden="true" />
      WS: {LABEL[connectionState]}
    </span>
  )
}
