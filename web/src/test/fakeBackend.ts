// Phase 4 integration test support: a minimal fetch-level fake of backend/main.py's real
// HTTP contract, seeded with the same values the real engine computes for fixtures/
// (verified against the live backend in earlier phases). Unlike Phase 3's component tests,
// nothing here mocks the `api` module -- `fetch` itself is replaced, so the real api client,
// the real components, and the real response-shape parsing are all exercised together.
import { vi } from 'vitest'
import type { TwinGraph, Finding, Patch, ReplayScenario } from '../api/types'

const HOST_ID = 'i-0123456789abcdef0'
const ROLE_ID = 'arn:aws:iam::123456789012:role/demo-role'

function twinFor(scenario: ReplayScenario): TwinGraph {
  const redisBind = scenario === 'healthy' || scenario === 'latent' ? '127.0.0.1' : '0.0.0.0'
  return {
    nodes: [
      { id: HOST_ID, kind: 'host', ports: [], tier: 2, sensitivity: 2, state: 'ok' },
      { id: 'internet', kind: 'internet', ports: [], tier: 0, sensitivity: 0, state: 'ok' },
      { id: 'imds', kind: 'imds', ports: [], tier: 1, sensitivity: 1, state: 'ok' },
      { id: 'nginx', kind: 'service', ports: [80], tier: 1, sensitivity: 1, state: 'ok', bind: '0.0.0.0' },
      { id: 'api', kind: 'service', ports: [3000], tier: 2, sensitivity: 1, state: 'ok', bind: '127.0.0.1' },
      { id: 'postgres', kind: 'datastore', ports: [5432], tier: 3, sensitivity: 3, state: 'ok', bind: '127.0.0.1' },
      {
        id: 'redis',
        kind: 'datastore',
        ports: [6379],
        tier: 2,
        sensitivity: 2,
        state: 'ok',
        bind: redisBind,
        noauth: scenario !== 'healthy' && scenario !== 'latent',
      },
      { id: ROLE_ID, kind: 'aws_role', ports: [], tier: 2, sensitivity: 3, state: 'ok' },
      { id: 'demo-data', kind: 'aws_bucket', ports: [], tier: 3, sensitivity: 3, state: 'ok' },
    ],
    edges: [
      { src: HOST_ID, dst: 'imds', kind: 'flow', observed: true, dep: 'none', port: null },
      { src: 'imds', dst: ROLE_ID, kind: 'grants', observed: true, dep: 'none', port: null },
      { src: 'nginx', dst: 'api', kind: 'flow', observed: true, dep: 'hard', port: 3000 },
      { src: 'api', dst: 'postgres', kind: 'flow', observed: true, dep: 'hard', port: 5432 },
      { src: 'api', dst: 'redis', kind: 'flow', observed: true, dep: 'soft', port: 6379 },
      { src: ROLE_ID, dst: 'demo-data', kind: 'grants', observed: true, dep: 'none', port: null },
    ],
  }
}

function findingFor(scenario: ReplayScenario): Finding {
  if (scenario === 'healthy') {
    return { id: 'exposure-redis', node: 'redis', status: 'closed', evidence: { bind: false, host_fw: true, sg: false }, confidence: 'high' }
  }
  if (scenario === 'latent') {
    return { id: 'exposure-redis', node: 'redis', status: 'latent', evidence: { bind: false, host_fw: true, sg: true }, confidence: 'high' }
  }
  if (scenario === 'exposed') {
    return { id: 'exposure-redis', node: 'redis', status: 'exposed', evidence: { bind: true, host_fw: true, sg: true }, confidence: 'high' }
  }
  return { id: 'exposure-redis', node: 'redis', status: 'internal', evidence: { bind: true, host_fw: true, sg: false }, confidence: 'high' }
}

function candidatesFor(scenario: ReplayScenario, sgRevoked: boolean): Patch[] {
  const exposed = scenario === 'exposed' && !sgRevoked
  const before = exposed ? { attack_surface: 7.5, band: 'HIGH' } : { attack_surface: 1.5, band: 'LOW' }
  const after = { attack_surface: 1.5, band: 'LOW' }
  return [
    {
      id: 'patch-sg-revoke-redis-6379',
      layer: 'aws',
      target: 'redis',
      op: 'sg_revoke',
      aws_cli: ['aws ec2 revoke-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 6379 --cidr 0.0.0.0/0'],
      iptables: [],
      terraform: null,
      rollback: ['aws ec2 authorize-security-group-ingress --group-id sg-0abc123 --protocol tcp --port 6379 --cidr 0.0.0.0/0'],
      before,
      after,
      invariants: { not_internet_reachable: true, no_flows_removed: true, port22_and_agent_untouched: true, rollback_exists: true },
      accepted: true,
      reason: null,
    },
    {
      id: 'patch-iptables-drop-redis-6379',
      layer: 'host',
      target: 'redis',
      op: 'iptables_drop',
      aws_cli: [],
      iptables: ['iptables -A INPUT -p tcp --dport 6379 ! -s 127.0.0.1 -j DROP'],
      terraform: null,
      rollback: ['iptables -D INPUT -p tcp --dport 6379 ! -s 127.0.0.1 -j DROP'],
      before,
      after,
      invariants: { not_internet_reachable: true, no_flows_removed: false, port22_and_agent_untouched: true, rollback_exists: true },
      accepted: false,
      reason: 'rejected: no_flows_removed',
    },
  ]
}

export class FakeBackend {
  scenario: ReplayScenario = 'healthy'
  sgRevoked = false
  events: Array<{ id: number; ts: number; type: string; payload: Record<string, unknown> }> = []
  private nextEventId = 1

  private addEvent(type: string, payload: Record<string, unknown>) {
    this.events.unshift({ id: this.nextEventId++, ts: Date.now() / 1000, type, payload })
  }

  step(): ReplayScenario {
    const order: ReplayScenario[] = ['healthy', 'latent', 'exposed', 'fixed']
    const next = order[Math.min(order.indexOf(this.scenario) + 1, order.length - 1)]
    if (next === 'exposed' && this.scenario !== 'exposed') this.addEvent('NEW_EXPOSURE', { target: 'redis' })
    this.scenario = next
    if (next === 'fixed') this.sgRevoked = true
    return next
  }

  fixPreview() {
    return {
      finding: findingFor(this.scenario),
      candidates: candidatesFor(this.scenario, this.sgRevoked),
      best_patch_id: 'patch-sg-revoke-redis-6379',
    }
  }

  apply(patchId: string, approve: boolean) {
    if (!approve) return { ok: false as const, status: 400, body: { detail: 'approve:true is required to apply a patch' } }
    this.sgRevoked = true
    this.addEvent('PATCH_APPLIED', { patch_id: patchId })
    return { ok: true as const, status: 200, body: { status: 'applied', patch_id: patchId } }
  }

  rollback(patchId: string) {
    this.sgRevoked = false
    this.addEvent('PATCH_ROLLED_BACK', { patch_id: patchId })
    return { status: 'rolled_back', patch_id: patchId }
  }
}

export function installFakeBackendFetch(backend: FakeBackend) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

    if (url.pathname === '/twin' && method === 'GET') {
      return json(twinFor(backend.scenario))
    }
    if (url.pathname === '/fix/exposure-redis' && method === 'GET') {
      return json(backend.fixPreview())
    }
    if (url.pathname === '/replay/step' && method === 'POST') {
      const scenario = backend.step()
      return json({ scenario, twin: twinFor(scenario) })
    }
    if (url.pathname.match(/^\/fix\/.+\/apply$/) && method === 'POST') {
      const patchId = url.pathname.split('/')[2]
      const { approve } = JSON.parse((init?.body as string) ?? '{}')
      const result = backend.apply(patchId, approve)
      return json(result.body, result.status)
    }
    if (url.pathname.match(/^\/fix\/.+\/rollback$/) && method === 'POST') {
      const patchId = url.pathname.split('/')[2]
      return json(backend.rollback(patchId))
    }
    if (url.pathname === '/events' && method === 'GET') {
      return json(backend.events)
    }
    if (url.pathname === '/spof' && method === 'GET') {
      return json([])
    }

    throw new Error(`fakeBackend: unhandled request ${method} ${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
