import { useState } from 'react'

const DISMISS_KEY = 'cst_hide_guide'

const STEPS = [
  'Step through the replay controls above (healthy → latent → exposed).',
  'Open "Findings & Fix" to see redis go from latent to exposed, with 3-layer evidence.',
  'Open "Failure" and simulate a redis failure to see the cascade.',
  'Back in "Findings & Fix", preview and apply the fix — behind explicit confirmation.',
]

export function GettingStartedBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // sessionStorage unavailable (e.g. private browsing) -- dismissal just won't persist
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded border border-purple-800 bg-purple-950/20 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">New here? Try this</p>
        <ol className="mt-1 list-inside list-decimal space-y-0.5 text-xs text-slate-300">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="dismiss getting started"
        className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
      >
        Dismiss
      </button>
    </div>
  )
}
