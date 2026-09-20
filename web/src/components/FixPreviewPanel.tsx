import { useState } from 'react'
import { api } from '../api/client'
import { useAsyncData, useAsyncAction } from '../hooks/useAsync'
import { useLive } from '../hooks/LiveContext'
import { AsyncBoundary } from './AsyncBoundary'
import { Badge } from './Badge'
import { ApplyConfirmDialog } from './ApplyConfirmDialog'
import { exposureLabel } from '../lib/exposureLabel'
import type { Patch } from '../api/types'

function RiskNumbers({ label, risk }: { label: string; risk: Record<string, unknown> }) {
  return (
    <span className="text-xs text-slate-300" data-testid={`risk-${label}`}>
      {label}: attack_surface={String(risk.attack_surface ?? '—')}{' '}
      <Badge tone={String(risk.band ?? '')}>{String(risk.band ?? '—')}</Badge>
    </span>
  )
}

function CandidateRow({ patch, onOpenApply }: { patch: Patch; onOpenApply: (p: Patch) => void }) {
  return (
    <li className="rounded border border-slate-800 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-xs">{patch.id}</span>{' '}
          <span className="text-xs text-slate-500">({patch.layer} / {patch.op})</span>
        </div>
        {patch.accepted ? (
          <Badge tone="ok">accepted</Badge>
        ) : (
          <Badge tone="down">rejected</Badge>
        )}
      </div>

      {!patch.accepted && patch.reason && (
        <p className="mt-1 text-xs text-red-300">{patch.reason}</p>
      )}

      <div className="mt-1 flex flex-wrap gap-3">
        <RiskNumbers label="before" risk={patch.before} />
        <RiskNumbers label="after" risk={patch.after} />
      </div>

      {patch.layer !== 'aws' && (
        <p className="mt-1 text-[11px] italic text-slate-500">
          {patch.layer} patch — preview only, never applyable via this UI/backend.
        </p>
      )}

      {patch.accepted && patch.layer === 'aws' && (
        <button
          type="button"
          onClick={() => onOpenApply(patch)}
          className="mt-2 rounded bg-red-800 px-2 py-1 text-xs font-medium text-red-50 hover:bg-red-700"
        >
          Review &amp; apply…
        </button>
      )}
    </li>
  )
}

/** Requirement 6: remediation / fix preview for one finding. Shows every candidate
 * patch (accepted or rejected + why), before/after risk, and clearly separates
 * "preview" (this panel, GET only) from "apply" (opens ApplyConfirmDialog). */
export function FixPreviewPanel({ findingId }: { findingId: string }) {
  const { messageCount } = useLive()
  // Refetches on findingId change AND on any WS event (replay step, apply, rollback) so an
  // already-expanded preview doesn't go stale -- it must reflect the same live state the
  // rest of the app does (SPEC §6/§7: never claim/imply a stale fix state as current).
  const preview = useAsyncData(() => api.getFixPreview(findingId), [findingId, messageCount])
  const rollback = useAsyncAction(api.rollbackFix)
  const [applyTarget, setApplyTarget] = useState<Patch | null>(null)
  const [appliedPatchId, setAppliedPatchId] = useState<string | null>(null)

  return (
    <div className="space-y-2 border-t border-slate-800 pt-2">
      <AsyncBoundary state={preview} onRetry={preview.refetch}>
        {(data) => (
          <>
            <p className="text-xs text-slate-400">
              Finding <span className="font-mono">{data.finding.id}</span> — status{' '}
              <span data-testid="finding-status">
                <Badge tone={data.finding.status}>{data.finding.status}</Badge>
              </span>{' '}
              · confidence {data.finding.confidence}{' '}
              <span className="text-slate-500">({exposureLabel(data.finding)})</span>
            </p>
            <ul className="space-y-2">
              {data.candidates.map((patch) => (
                <CandidateRow key={patch.id} patch={patch} onOpenApply={setApplyTarget} />
              ))}
            </ul>

            {applyTarget && (
              <ApplyConfirmDialog
                patch={applyTarget}
                onCancel={() => setApplyTarget(null)}
                onApplied={() => {
                  setAppliedPatchId(applyTarget.id)
                  setApplyTarget(null)
                  preview.refetch()
                }}
              />
            )}

            {appliedPatchId && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={rollback.state.status === 'loading'}
                  onClick={() => rollback.run(appliedPatchId).then(() => preview.refetch())}
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Rollback last apply
                </button>
                {rollback.state.status === 'success' && (
                  <span role="status" className="text-xs text-emerald-400">
                    rolled back
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </AsyncBoundary>
    </div>
  )
}
