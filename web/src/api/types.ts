// Mirrors engine/models.py and the JSON shapes returned by backend/main.py.
// Kept intentionally loose (extra fields allowed) since the backend is the source of truth.

export type NodeKind =
  | 'internet'
  | 'host'
  | 'service'
  | 'datastore'
  | 'imds'
  | 'aws_role'
  | 'aws_bucket'

export type NodeState = 'ok' | 'degraded' | 'down' | 'compromised'

export interface TwinNode {
  id: string
  kind: NodeKind
  ports: number[]
  tier: number
  sensitivity: number
  state: NodeState
  bind?: string
  noauth?: boolean
}

export interface TwinEdge {
  src: string
  dst: string
  kind: 'flow' | 'exposes' | 'runs_on' | 'grants'
  port: number | null
  observed: boolean
  dep: 'hard' | 'soft' | 'none'
  potential?: boolean
  mitre?: string
}

export interface TwinGraph {
  nodes: TwinNode[]
  edges: TwinEdge[]
}

export type ExposureStatus = 'exposed' | 'latent' | 'internal' | 'closed'

export interface Finding {
  id: string
  node: string
  status: ExposureStatus
  evidence: Record<string, boolean>
  confidence: 'high' | 'low'
}

export interface FailureResult {
  node: string
  affected_services: Record<string, NodeState>
  affected_endpoints: Record<string, 'OK' | 'DEGRADED' | 'FAILED'>
  critical_paths: Record<string, string[]>
  recovery_order: string[]
}

export interface SpofEntry {
  node: string
  failed_endpoints: string[]
  count: number
}

export interface AttackPath {
  path: string[]
  hops: number
  mitre: string[]
  potential: boolean
}

export interface AttackResult {
  entry_type: string
  entry_node: string
  paths: Record<string, AttackPath>
  blast_radius: number
}

export interface Patch {
  id: string
  layer: 'aws' | 'host' | 'terraform'
  target: string
  op: 'sg_revoke' | 'iptables_drop' | 'bind_localhost' | null
  aws_cli: string[]
  iptables: string[]
  terraform: string | null
  rollback: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
  invariants: Record<string, boolean>
  accepted: boolean
  reason: string | null
}

export interface FixPreview {
  finding: Finding
  candidates: Patch[]
  best_patch_id: string | null
}

export interface ApplyResult {
  status: 'applied'
  patch_id: string
}

export interface RollbackResult {
  status: 'rolled_back'
  patch_id: string
}

export interface ProbeResult {
  host: string
  port: number
  status: 'reachable' | 'unreachable' | 'unknown'
  reason: string | null
  elapsed_ms: number
}

export interface ExplainResult {
  source: 'template' | 'bedrock'
  generated_by: 'deterministic' | 'ai'
  text: string
  bedrock_error?: string
}

export interface EventEntry {
  id: number
  ts: number
  type: string
  payload: Record<string, unknown>
}

export type ReplayScenario = 'healthy' | 'latent' | 'exposed' | 'fixed'

export interface ReplayStepResult {
  scenario: ReplayScenario
  twin: TwinGraph
}
