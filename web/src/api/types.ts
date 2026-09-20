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
  // 'unconnected' is the real default until a real agent ingests or demo/replay
  // mode is explicitly activated (see backend/main.py's Backend._mode).
  mode?: 'unconnected' | 'demo' | 'live'
  connected?: boolean
  last_seen_seconds_ago?: number | null
  agent_id?: string | null
  hostname?: string | null
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

export type PerformanceConfidence = 'high' | 'medium' | 'low'

export interface PerformanceFinding {
  type: string
  evidence: string[]
  confidence: PerformanceConfidence
  explanation: string
}

export interface PerformanceHistorySample {
  ts: number
  cpu_percent: number
  memory_percent: number | null
}

export interface PerformanceResult {
  available: boolean
  source: 'unconnected' | 'demo' | 'live'
  reason?: string
  observed?: Record<string, unknown>
  findings?: PerformanceFinding[]
  explanation?: string
  history?: { series: PerformanceHistorySample[]; trend: string | null }
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

export interface RegisterAgentResult {
  agent_id: string
  token: string
}

export interface ConnectionStatus {
  mode: 'unconnected' | 'demo' | 'live'
  connected: boolean
  agent_id: string | null
  hostname: string | null
  last_seen_seconds_ago: number | null
}

export interface AgentSummary {
  agent_id: string
  hostname: string | null
  created_at: number
  last_seen: number | null
  last_seen_seconds_ago: number | null
  connected: boolean
}

export interface AgentStatus {
  agent_id: string
  connected: boolean
  last_seen_seconds_ago: number | null
}

export interface ProcessInfo {
  pid: number | null
  ppid: number | null
  name: string
  exe: string | null
  user: string
  cpu_percent: number | null
  memory_percent: number | null
  create_time: number | null
  cmdline: string[] | null
}

export interface ListenerInfo {
  pid: number
  proc: string
  user: string
  proto: string
  bind: string
  port: number
}

export interface ProcessesResult {
  available: boolean
  processes?: ProcessInfo[]
  listeners?: ListenerInfo[]
}

export interface ScanResult {
  status: 'complete'
  scanned_at: number
  mode: 'unconnected' | 'demo' | 'live'
  twin: TwinGraph
  findings: Finding[]
  spof: SpofEntry[]
}
