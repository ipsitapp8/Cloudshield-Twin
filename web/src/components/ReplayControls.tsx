import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncAction } from '../hooks/useAsync'
import { useAgentMode } from '../hooks/useAgentMode'
import type { ReplayScenario } from '../api/types'

const ORDER: ReplayScenario[] = ['healthy', 'latent', 'exposed', 'fixed']

/** SPEC §6 POST /replay/step progression: healthy -> latent -> exposed -> fixed.
 * The backend has no "current scenario" getter, so we track it client-side starting
 * from the documented initial state and update it from each step/reset response.
 * Disabled once a real agent is live -- the backend rejects /replay/* with 409 so
 * demo fixtures can never overwrite real telemetry (README: LIVE mode never mixes
 * with replay). */
export function ReplayControls() {
  const [scenario, setScenario] = useState<ReplayScenario>('healthy')
  const step = useAsyncAction(api.replayStep)
  const reset = useAsyncAction(api.replayReset)
  const isLive = useAgentMode() === 'live'

  const busy = step.state.status === 'loading' || reset.state.status === 'loading'
  const atEnd = scenario === 'fixed'

  return (
    <div className="flex items-center gap-3" title={isLive ? 'Disabled while a real VM is connected — this replays demo/fixture data' : undefined}>
      <div className="flex items-center gap-1 text-xs text-slate-400" aria-label="replay progression">
        {ORDER.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className={
                s === scenario
                  ? 'rounded bg-purple-800 px-2 py-0.5 font-semibold text-purple-100'
                  : 'px-1 text-slate-500'
              }
            >
              {s}
            </span>
            {i < ORDER.length - 1 && <span>→</span>}
          </span>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || atEnd || isLive}
        onClick={() =>
          step.run().then((result) => setScenario(result.scenario)).catch(() => {})
        }
        className="rounded bg-purple-700 px-3 py-1 text-xs font-medium text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Step ▶
      </button>
      <button
        type="button"
        disabled={busy || isLive}
        onClick={() =>
          reset.run().then((result) => setScenario(result.scenario)).catch(() => {})
        }
        className="rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Reset ⟲
      </button>
      {!isLive && step.state.status === 'error' && (
        <span role="alert" className="text-xs text-red-400">
          {step.state.error.message}
        </span>
      )}
    </div>
  )
}
