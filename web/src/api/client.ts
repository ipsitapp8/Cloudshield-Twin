// Thin fetch wrapper around the existing backend/main.py FastAPI endpoints.
// No endpoint here is invented: every path/method matches backend/main.py exactly.
import type {
  AgentStatus,
  AgentSummary,
  ApplyResult,
  AttackResult,
  ConnectionStatus,
  EventEntry,
  ExplainResult,
  FailureResult,
  FixPreview,
  PerformanceResult,
  ProbeResult,
  ProcessesResult,
  RegisterAgentResult,
  ReplayStepResult,
  RollbackResult,
  ScanResult,
  SpofEntry,
  TwinGraph,
} from './types'

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

export const WS_URL: string = API_BASE_URL.replace(/^http/, 'ws') + '/ws'

/** Thrown for a well-formed HTTP response that reports an error (4xx/5xx). */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Thrown when the backend could not be reached at all (network/CORS/offline). */
export class BackendUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Cannot reach the CloudShield Twin backend. Is it running?')
    this.name = 'BackendUnavailableError'
    this.cause = cause
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    })
  } catch (cause) {
    throw new BackendUnavailableError(cause)
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // response body wasn't JSON; fall back to statusText
    }
    throw new ApiError(response.status, detail)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  getTwin: () => request<TwinGraph>('/twin'),

  simulateFailure: (node: string) =>
    request<FailureResult>('/simulate/failure', {
      method: 'POST',
      body: JSON.stringify({ node }),
    }),

  simulateAttack: (entryType: string, node: string) =>
    request<AttackResult>('/simulate/attack', {
      method: 'POST',
      body: JSON.stringify({ entry_type: entryType, node }),
    }),

  getSpof: () => request<SpofEntry[]>('/spof'),

  getPerformance: () => request<PerformanceResult>('/performance'),

  getFixPreview: (findingId: string) => request<FixPreview>(`/fix/${encodeURIComponent(findingId)}`),

  applyFix: (patchId: string, approve: boolean) =>
    request<ApplyResult>(`/fix/${encodeURIComponent(patchId)}/apply`, {
      method: 'POST',
      body: JSON.stringify({ approve }),
    }),

  rollbackFix: (rollbackId: string) =>
    request<RollbackResult>(`/fix/${encodeURIComponent(rollbackId)}/rollback`, {
      method: 'POST',
    }),

  probe: (port: number, host?: string) => {
    const params = new URLSearchParams({ port: String(port) })
    if (host) params.set('host', host)
    return request<ProbeResult>(`/probe?${params.toString()}`)
  },

  getEvents: (limit = 50) => request<EventEntry[]>(`/events?limit=${limit}`),

  explain: (context: Record<string, unknown>) =>
    request<ExplainResult>('/explain', { method: 'POST', body: JSON.stringify({ context }) }),

  replayStep: () => request<ReplayStepResult>('/replay/step', { method: 'POST' }),

  replayReset: () => request<ReplayStepResult>('/replay/reset', { method: 'POST' }),

  registerAgent: () => request<RegisterAgentResult>('/agents/register', { method: 'POST' }),

  getConnection: () => request<ConnectionStatus>('/connection'),

  getProcesses: () => request<ProcessesResult>('/processes'),

  listAgents: () => request<AgentSummary[]>('/agents'),

  getAgentStatus: (agentId: string) => request<AgentStatus>(`/agents/${encodeURIComponent(agentId)}/status`),

  scanNow: () => request<ScanResult>('/scan', { method: 'POST' }),
}
