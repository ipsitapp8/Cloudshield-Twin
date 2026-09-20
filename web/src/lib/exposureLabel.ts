import type { ExposureStatus, Finding } from '../api/types'

// Presentation-only mapping onto Spec.md §A's authoritative exposure states
// (exposed | latent | internal | closed, "unknown firewall -> confidence low").
// No new field, no engine change -- just clearer user-facing wording.
const LABELS: Record<ExposureStatus, string> = {
  exposed: 'CONFIRMED EXPOSED',
  latent: 'POTENTIALLY EXPOSED',
  internal: 'LOCAL',
  closed: 'LOCAL',
}

export function exposureLabel(finding: Pick<Finding, 'status' | 'confidence'>): string {
  const base = LABELS[finding.status] ?? finding.status.toUpperCase()
  return finding.confidence === 'low' ? `${base} (confidence: low)` : base
}
