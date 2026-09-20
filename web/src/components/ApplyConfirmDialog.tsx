import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncAction } from '../hooks/useAsync'
import type { Patch } from '../api/types'

/** Requirement 7: apply confirmation. Explicit approval (checkbox + button), safety
 * restrictions spelled out, and only ever sends the pre-computed patch's own aws_cli --
 * there is no free-text/arbitrary command input anywhere in this dialog. */
export function ApplyConfirmDialog({
  patch,
  onCancel,
  onApplied,
}: {
  patch: Patch
  onCancel: () => void
  onApplied: () => void
}) {
  const [understood, setUnderstood] = useState(false)
  const apply = useAsyncAction((patchId: string) => api.applyFix(patchId, true))

  const applied = apply.state.status === 'success'

  return (
    <div
      role="dialog"
      aria-label={`Apply confirmation for ${patch.id}`}
      className="space-y-3 rounded border border-amber-700 bg-amber-950/20 p-4"
    >
      <p className="text-sm font-semibold text-amber-300">Confirm apply — this changes the live environment</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-300">
        <dt className="text-slate-500">Patch</dt>
        <dd className="font-mono">{patch.id}</dd>
        <dt className="text-slate-500">Layer</dt>
        <dd>{patch.layer}</dd>
        <dt className="text-slate-500">Target</dt>
        <dd className="font-mono">{patch.target}</dd>
      </dl>

      <div>
        <p className="text-xs font-semibold text-slate-400">Will run (via backend allowlist only):</p>
        <ul className="mt-1 space-y-1 font-mono text-[11px] text-slate-300">
          {patch.aws_cli.map((cmd) => (
            <li key={cmd} className="break-all rounded bg-slate-900 p-1">
              {cmd}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-400">Rollback stored for this apply:</p>
        <ul className="mt-1 space-y-1 font-mono text-[11px] text-slate-300">
          {patch.rollback.map((cmd) => (
            <li key={cmd} className="break-all rounded bg-slate-900 p-1">
              {cmd}
            </li>
          ))}
        </ul>
      </div>

      <ul className="list-inside list-disc space-y-0.5 text-[11px] text-amber-200/80">
        <li>Only this exact, pre-computed security-group change can be applied — no arbitrary commands.</li>
        <li>Port 22 and the agent channel are rejected by the backend regardless of this dialog.</li>
        <li>A rollback command is stored before anything runs.</li>
        <li>Every apply/rollback is appended to audit.jsonl.</li>
      </ul>

      {!applied && (
        <>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            I understand this will modify the live security group.
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!understood || apply.state.status === 'loading'}
              onClick={() => apply.run(patch.id).catch(() => {})}
              className="rounded bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {apply.state.status === 'loading' ? 'Applying…' : 'Approve & Apply'}
            </button>
          </div>
        </>
      )}

      {apply.state.status === 'error' && (
        <p role="alert" className="text-xs text-red-400">
          {apply.state.error.message}
        </p>
      )}
      {apply.state.status === 'success' && (
        <>
          <p role="status" className="text-xs font-semibold text-emerald-400">
            Backend confirmed: applied ({apply.state.data.patch_id}).
          </p>
          {/* The parent only clears/refetches once the user acknowledges this, so the
              confirmation is guaranteed to actually be shown -- see onApplied below. */}
          <button
            type="button"
            onClick={() => onApplied(apply.state.status === 'success' ? apply.state.data.patch_id : patch.id)}
            className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </>
      )}
    </div>
  )
}
