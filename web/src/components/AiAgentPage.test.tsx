import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiAgentPage } from './AiAgentPage'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'
import type { AttackResult, FixPreview, TwinGraph } from '../api/types'

const graph: TwinGraph = {
  nodes: [
    { id: 'internet', kind: 'internet', ports: [], tier: 0, sensitivity: 0, state: 'ok' },
    { id: 'nginx', kind: 'service', ports: [443], tier: 1, sensitivity: 1, state: 'ok' },
    { id: 'api', kind: 'service', ports: [8080], tier: 2, sensitivity: 1, state: 'ok' },
    { id: 'redis', kind: 'datastore', ports: [6379], tier: 2, sensitivity: 2, state: 'ok', noauth: true },
    { id: 'database', kind: 'datastore', ports: [5432], tier: 3, sensitivity: 3, state: 'ok' },
  ],
  edges: [],
}

const attackResult: AttackResult = {
  entry_type: 'compromised_service',
  entry_node: 'redis',
  paths: {
    database: { path: ['internet', 'nginx', 'api', 'redis', 'database'], hops: 4, mitre: ['T1190'], potential: true },
  },
  blast_radius: 3,
}

function preview(): FixPreview {
  return {
    finding: { id: 'exposure-redis', node: 'redis', status: 'exposed', evidence: { bind: true, host_fw: true, sg: true }, confidence: 'high' },
    candidates: [
      {
        id: 'patch-sg-revoke-redis-6379',
        layer: 'aws',
        target: 'redis',
        op: 'sg_revoke',
        aws_cli: ['aws ec2 revoke-security-group-ingress --group-id sg-1 --protocol tcp --port 6379 --cidr 0.0.0.0/0'],
        iptables: [],
        terraform: null,
        rollback: ['aws ec2 authorize-security-group-ingress --group-id sg-1 --protocol tcp --port 6379 --cidr 0.0.0.0/0'],
        before: { attack_surface: 7.5, band: 'HIGH' },
        after: { attack_surface: 1.5, band: 'LOW' },
        invariants: {},
        accepted: true,
        reason: null,
      },
      {
        id: 'patch-iptables-drop-redis-6379',
        layer: 'host',
        target: 'redis',
        op: 'iptables_drop',
        aws_cli: [],
        iptables: ['iptables -A INPUT -p tcp --dport 6379 -j DROP'],
        terraform: null,
        rollback: [],
        before: { attack_surface: 7.5, band: 'HIGH' },
        after: { attack_surface: 1.5, band: 'LOW' },
        invariants: {},
        accepted: false,
        reason: 'rejected: no_flows_removed',
      },
    ],
    best_patch_id: 'patch-sg-revoke-redis-6379',
  }
}

afterEach(() => vi.restoreAllMocks())

describe('AiAgentPage', () => {
  it('renders the real attack path, findings, and fix options for the detected exposure', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue(graph)
    vi.spyOn(api, 'getFixPreview').mockResolvedValue(preview())
    vi.spyOn(api, 'simulateAttack').mockResolvedValue(attackResult)

    renderWithLive(<AiAgentPage />)

    // Attack path visual: real path nodes appear
    await waitFor(() => expect(screen.getAllByText('database').length).toBeGreaterThan(0))
    expect(screen.getByText('nginx')).toBeInTheDocument()
    expect(screen.getByText('api')).toBeInTheDocument()

    // AI findings cite real evidence
    await waitFor(() => expect(screen.getByText(/exposed service/i)).toBeInTheDocument())
    expect(screen.getByText(/3 reachable asset\(s\)\./)).toBeInTheDocument()

    // Attack simulation cascade shows the real target + blast radius
    expect(screen.getByText(/potentially exposed/i)).toHaveTextContent('database potentially exposed')
    expect(screen.getAllByText(/blast radius/i).length).toBeGreaterThanOrEqual(2)

    // Recommended fix: real accepted/rejected candidates
    await waitFor(() => expect(screen.getByText(/block port on redis/i)).toBeInTheDocument())
    expect(screen.getByText(/recommended action/i)).toBeInTheDocument()
    expect(screen.getByText(/revoke-security-group-ingress/)).toBeInTheDocument()
  })

  it('shows a real verification checklist after applying the fix', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue(graph)
    vi.spyOn(api, 'getFixPreview').mockResolvedValue(preview())
    vi.spyOn(api, 'simulateAttack')
      .mockResolvedValueOnce(attackResult) // initial analysis
      .mockResolvedValue({ ...attackResult, paths: {}, blast_radius: 0 }) // every post-apply call: eliminated
    vi.spyOn(api, 'applyFix').mockResolvedValue({ status: 'applied', patch_id: 'patch-sg-revoke-redis-6379' })

    renderWithLive(<AiAgentPage />)
    await waitFor(() => expect(screen.getByText(/review & apply/i)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /review & apply/i }))
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /approve & apply/i }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/backend confirmed/i))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.getByText(/attack path eliminated/i)).toBeInTheDocument())
  })
})
