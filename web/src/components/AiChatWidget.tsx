import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncAction } from '../hooks/useAsync'
import { ArrowRightIcon, SparklesIcon } from './icons'

const COMPROMISED_RE = /what (?:if|happens if)\s+(\S+)\s+is compromised/i
const FAILS_RE = /what (?:if|happens if)\s+(\S+)\s+(?:fails|goes down|is down)/i

/** Recognizes two real question shapes and maps them to real backend calls (never a
 * fabricated free-form answer). Anything else routes through the existing
 * deterministic POST /explain, which honestly declines unstructured input rather
 * than inventing one -- consistent with "engine authoritative, LLM optional". */
export function AiChatWidget({
  nodeIds,
  onAskCompromised,
  onAskFailure,
}: {
  nodeIds: string[]
  onAskCompromised: (node: string) => void
  onAskFailure: (node: string) => void
}) {
  const [text, setText] = useState('')
  const explain = useAsyncAction(api.explain)

  function resolveNode(candidate: string): string | undefined {
    const lower = candidate.toLowerCase().replace(/[.?!]+$/, '')
    return nodeIds.find((id) => id.toLowerCase() === lower) ?? (nodeIds.includes(candidate) ? candidate : undefined)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const question = text.trim()
    if (!question) return

    const compromised = question.match(COMPROMISED_RE)
    const fails = question.match(FAILS_RE)
    if (compromised) {
      const node = resolveNode(compromised[1])
      if (node) {
        onAskCompromised(node)
        setText('')
        return
      }
    }
    if (fails) {
      const node = resolveNode(fails[1])
      if (node) {
        onAskFailure(node)
        setText('')
        return
      }
    }
    explain.run({ kind: 'chat', question }).catch(() => {})
  }

  return (
    <div className="rounded-xl border border-purple-800/60 bg-gradient-to-b from-purple-950/40 to-slate-950 p-4">
      <div className="mb-2 flex items-center gap-2">
        <SparklesIcon className="h-4 w-4 text-purple-400" />
        <p className="text-sm font-semibold text-slate-100">AI Security Twin Agent</p>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Ask anything about your infrastructure, attack paths, and fixes.
      </p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. What if this server is compromised?"
          aria-label="ask the AI agent"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600"
        />
        <button
          type="submit"
          aria-label="ask"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-700 text-white hover:bg-purple-600"
        >
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </form>
      {explain.state.status === 'success' && (
        <p className="mt-3 rounded border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-300">
          {explain.state.data.text}
        </p>
      )}
    </div>
  )
}
