import { CheckCircleIcon, XCircleIcon } from './icons'

export interface VerificationItem {
  label: string
  passed: boolean
}

/** Presentational only -- every item's `passed` value is computed by the caller from
 * real re-checks (a fresh POST /simulate/attack after apply, compared to before),
 * never a hardcoded checkmark. */
export function VerificationCard({ items }: { items: VerificationItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm">
          {item.passed ? (
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <XCircleIcon className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <span className={item.passed ? 'text-slate-200' : 'text-red-300'}>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
