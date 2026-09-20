import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { Badge } from './Badge'
import type { FixPreview } from '../api/types'

const FINDING_ID = 'exposure-redis'
const AUTO_ADVANCE_MS = 7000

interface StoryData {
  latentFinding?: FixPreview
  exposedFinding?: FixPreview
  attackPath?: string[]
  attackMitre?: string[]
  blastRadius?: number
  failureServices?: Record<string, string>
  failureEndpoints?: Record<string, string>
  fixedFinding?: FixPreview
}

interface Beat {
  title: string
  narration: (data: StoryData) => string
  run: (data: StoryData) => Promise<Partial<StoryData>>
  render: (data: StoryData) => React.ReactNode
}

function riskLine(preview: FixPreview | undefined) {
  const risk = preview?.candidates[0]?.before
  if (!risk) return null
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-2xl font-bold text-slate-100">{String(risk.attack_surface)}</span>
      {typeof risk.band === 'string' && <Badge tone={risk.band}>{risk.band}</Badge>}
    </div>
  )
}

const BEATS: Beat[] = [
  {
    title: 'A quiet Tuesday',
    narration: () => "Here's your stack: nginx, an API, Postgres, Redis. Right now, everything is healthy.",
    run: async () => {
      await api.replayReset()
      return {}
    },
    render: () => (
      <p className="text-sm text-slate-400">nginx → api → postgres, redis — nothing exposed, nothing degraded.</p>
    ),
  },
  {
    title: "Someone widens a security group",
    narration: () => 'A security group now allows 0.0.0.0/0 on port 6379. Redis is still bound to localhost, so nothing can reach it yet — this is LATENT, not exposed.',
    run: async () => {
      await api.replayStep()
      const latentFinding = await api.getFixPreview(FINDING_ID)
      return { latentFinding }
    },
    render: (data) => (
      <p className="text-sm">
        Redis status: <Badge tone={data.latentFinding?.finding.status ?? ''}>{data.latentFinding?.finding.status ?? '—'}</Badge>
        <span className="ml-2 text-slate-500">(SG open, bind still 127.0.0.1 — no real risk yet)</span>
      </p>
    ),
  },
  {
    title: 'Redis starts listening on 0.0.0.0',
    narration: () => 'Now Redis is bound wide open. Combined with the open security group, it is genuinely reachable from the internet.',
    run: async () => {
      await api.replayStep()
      const exposedFinding = await api.getFixPreview(FINDING_ID)
      return { exposedFinding }
    },
    render: (data) => (
      <div className="space-y-2">
        <p className="text-sm">
          Redis status: <Badge tone={data.exposedFinding?.finding.status ?? ''}>{data.exposedFinding?.finding.status ?? '—'}</Badge>
        </p>
        <div className="flex gap-2 text-xs">
          {Object.entries(data.exposedFinding?.finding.evidence ?? {}).map(([layer, ok]) => (
            <span key={layer} className={`rounded border px-2 py-0.5 ${ok ? 'border-red-700 text-red-300' : 'border-slate-700 text-slate-500'}`}>
              {layer}: {String(ok)}
            </span>
          ))}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Attack surface right now</p>
          {riskLine(data.exposedFinding)}
        </div>
      </div>
    ),
  },
  {
    title: 'What could an attacker actually reach?',
    narration: () => "Not theoretical — this is the real, computed path from the internet to your S3 data.",
    run: async () => {
      const result = await api.simulateAttack('public_service', 'internet')
      const targetKey = 'demo-data' in result.paths ? 'demo-data' : Object.keys(result.paths)[0]
      const target = targetKey ? result.paths[targetKey] : undefined
      return { attackPath: target?.path, attackMitre: target?.mitre, blastRadius: result.blast_radius }
    },
    render: (data) =>
      data.attackPath ? (
        <div className="space-y-2">
          <p className="rounded border border-red-800 bg-red-950/20 p-2 font-mono text-sm text-red-200">
            {data.attackPath.join(' → ')}
          </p>
          <p className="text-xs text-slate-400">
            MITRE: {data.attackMitre?.join(', ') || '—'} · blast radius: {data.blastRadius} reachable assets
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No path to a sensitive asset was found from this entry point.</p>
      ),
  },
  {
    title: 'And if Redis just falls over on its own?',
    narration: () => "Separately from the security issue — here's the blast radius if Redis simply goes down.",
    run: async () => {
      const result = await api.simulateFailure('redis')
      return { failureServices: result.affected_services, failureEndpoints: result.affected_endpoints }
    },
    render: (data) => (
      <div className="flex flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Services</p>
          {Object.entries(data.failureServices ?? {}).map(([svc, state]) => (
            <span key={svc} className="mr-2 text-sm">
              <span className="font-mono">{svc}</span> <Badge tone={state}>{state}</Badge>
            </span>
          ))}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Endpoints</p>
          {Object.entries(data.failureEndpoints ?? {}).map(([ep, status]) => (
            <span key={ep} className="mr-2 text-sm">
              <span className="font-mono">{ep}</span> <Badge tone={status}>{status}</Badge>
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'The narrowest possible fix',
    narration: () => 'This is the actual computed recommendation — not a suggestion, the real accepted patch for this exact system.',
    run: async () => {
      const fixedFinding = await api.getFixPreview(FINDING_ID)
      return { fixedFinding }
    },
    render: (data) => {
      const best = data.fixedFinding?.candidates.find((c) => c.id === data.fixedFinding?.best_patch_id)
      return (
        <div className="space-y-2">
          {best && (
            <p className="rounded border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-slate-300">
              {best.aws_cli[0]}
            </p>
          )}
          <div className="flex items-center gap-4 text-sm">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Before</p>
              {riskLine(data.fixedFinding)}
            </div>
            <span className="text-slate-600">→</span>
            <div>
              <p className="text-[10px] uppercase text-slate-500">After (if applied)</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-bold text-emerald-400">
                  {String(best?.after.attack_surface ?? '—')}
                </span>
                {typeof best?.after.band === 'string' && <Badge tone={best.after.band}>{best.after.band}</Badge>}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Only port 6379 on the one configured security group. Port 22 and the agent channel are never touched.
          </p>
        </div>
      )
    },
  },
]

export function IncidentStory({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<StoryData>({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [paused, setPaused] = useState(false)
  const ranStep = useRef(-1)

  const beat = BEATS[step]
  const isLast = step === BEATS.length - 1

  useEffect(() => {
    if (ranStep.current === step) return
    ranStep.current = step
    setStatus('loading')
    beat
      .run(data)
      .then((partial) => {
        setData((prev) => ({ ...prev, ...partial }))
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    if (status !== 'ready' || paused || isLast) return
    const timer = setTimeout(() => setStep((s) => Math.min(s + 1, BEATS.length - 1)), AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [status, paused, isLast])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1">
            {BEATS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${i <= step ? 'bg-purple-600' : 'bg-slate-700'}`}
              />
            ))}
          </div>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">
            Skip ✕
          </button>
        </div>

        <p className="text-xs font-semibold uppercase tracking-widest text-purple-400">
          Step {step + 1} of {BEATS.length}
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-50">{beat.title}</h2>
        <p className="mt-2 text-sm text-slate-300">{beat.narration(data)}</p>

        <div className="mt-4 min-h-[72px] rounded border border-slate-800 bg-slate-950/50 p-3">
          {status === 'loading' && <p className="text-sm text-slate-500">Running against the real backend…</p>}
          {status === 'error' && (
            <p role="alert" className="text-sm text-red-400">
              Something went wrong talking to the backend — is it running?
            </p>
          )}
          {status === 'ready' && beat.render(data)}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:bg-slate-800"
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(s - 1, 0))}
                className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                ← Back
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(s + 1, BEATS.length - 1))}
                className="rounded bg-purple-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-600"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-purple-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-600"
              >
                Explore the dashboard →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
