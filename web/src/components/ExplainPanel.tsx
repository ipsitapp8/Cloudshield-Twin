import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncAction } from '../hooks/useAsync'
import { Badge } from './Badge'

const SAMPLE = JSON.stringify(
  { kind: 'finding', node: 'redis', status: 'exposed', confidence: 'high' },
  null,
  2,
)

/** Requirement 10: explain panel, via POST /explain. Sends only structured JSON (never
 * free-text commands) and clearly labels deterministic-template vs. AI-generated output
 * per SPEC §7/§9 ("LLM output must never be interpreted as executable commands"). */
export function ExplainPanel() {
  const [contextText, setContextText] = useState(SAMPLE)
  const [parseError, setParseError] = useState<string | null>(null)
  const explain = useAsyncAction(api.explain)

  function handleExplain() {
    try {
      const context = JSON.parse(contextText) as Record<string, unknown>
      setParseError(null)
      explain.run(context).catch(() => {})
    } catch {
      setParseError('Context must be valid JSON.')
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Explain</h2>
      <p className="text-xs text-slate-500">
        Structured JSON only (e.g. a finding, failure, or attack result) — never a command.
      </p>
      <textarea
        value={contextText}
        onChange={(e) => setContextText(e.target.value)}
        aria-label="explain context JSON"
        rows={6}
        className="w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs"
      />
      {parseError && (
        <p role="alert" className="text-xs text-red-400">
          {parseError}
        </p>
      )}
      <button
        type="button"
        disabled={explain.state.status === 'loading'}
        onClick={handleExplain}
        className="rounded bg-purple-700 px-3 py-1 text-xs font-medium text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Explain
      </button>

      {explain.state.status === 'error' && (
        <p role="alert" className="text-sm text-red-400">
          {explain.state.error.message}
        </p>
      )}
      {explain.state.status === 'success' && (
        <div className="rounded border border-slate-800 p-3 text-sm">
          <p className="mb-1">
            <Badge tone={explain.state.data.generated_by === 'ai' ? 'compromised' : 'ok'}>
              {explain.state.data.generated_by === 'ai' ? 'AI-generated' : 'Deterministic'}
            </Badge>{' '}
            <span className="text-xs text-slate-500">source: {explain.state.data.source}</span>
          </p>
          <p className="text-slate-200">{explain.state.data.text}</p>
          {explain.state.data.bedrock_error && (
            <p className="mt-1 text-xs text-amber-400">
              Bedrock unavailable, fell back to template: {explain.state.data.bedrock_error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
