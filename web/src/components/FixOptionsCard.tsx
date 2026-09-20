import { useState } from 'react'
import type { Patch } from '../api/types'
import { ApplyConfirmDialog } from './ApplyConfirmDialog'
import { CheckCircleIcon, WarningTriangleIcon, XCircleIcon } from './icons'

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']

/** Same candidates FixPreviewPanel/CandidateRow already render (GET /fix/{id}), shown
 * as an Option A/B/... comparison. Apply still goes through the unmodified
 * ApplyConfirmDialog -- preview/approve/audit/rollback are untouched. */
export function FixOptionsCard({ candidates, onApplied }: { candidates: Patch[]; onApplied: (patchId: string) => void }) {
  const [applyTarget, setApplyTarget] = useState<Patch | null>(null)
  const best = candidates.find((c) => c.accepted)

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {candidates.map((patch, i) => (
          <li
            key={patch.id}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
              patch.accepted ? 'border-emerald-800 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs font-semibold text-slate-300">
                {OPTION_LETTERS[i] ?? i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-100">
                  {patch.op === 'sg_revoke' ? `Block port on ${patch.target}` : patch.op ?? patch.id}
                </p>
                <p className="text-xs text-slate-500">
                  {patch.accepted ? 'Impact: no service disruption' : patch.reason ?? 'Rejected'}
                </p>
              </div>
            </div>
            {patch.accepted ? (
              <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <XCircleIcon className="h-5 w-5 shrink-0 text-red-500" />
            )}
          </li>
        ))}
      </ul>

      {best && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-800 bg-emerald-950/20 p-3">
          <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-300">Recommended action</p>
            <p className="text-xs text-emerald-200/80">
              Apply Option {OPTION_LETTERS[candidates.indexOf(best)] ?? ''} — {best.aws_cli[0]}
            </p>
          </div>
          {best.layer === 'aws' && (
            <button
              type="button"
              onClick={() => setApplyTarget(best)}
              className="shrink-0 rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
            >
              Review &amp; apply…
            </button>
          )}
        </div>
      )}

      {applyTarget && (
        <ApplyConfirmDialog
          patch={applyTarget}
          onCancel={() => setApplyTarget(null)}
          onApplied={() => {
            onApplied(applyTarget.id)
            setApplyTarget(null)
          }}
        />
      )}
    </div>
  )
}
