import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IncidentStory } from './IncidentStory'
import { api } from '../api/client'
import type { AttackResult, FailureResult, FixPreview } from '../api/types'

function finding(status: FixPreview['finding']['status'], attackSurface: number, band: string): FixPreview {
  return {
    finding: { id: 'exposure-redis', node: 'redis', status, evidence: { bind: true, host_fw: true, sg: true }, confidence: 'high' },
    candidates: [
      {
        id: 'patch-sg-revoke-redis-6379',
        layer: 'aws',
        target: 'redis',
        op: 'sg_revoke',
        aws_cli: ['aws ec2 revoke-security-group-ingress --group-id sg-1 --protocol tcp --port 6379 --cidr 0.0.0.0/0'],
        iptables: [],
        terraform: null,
        rollback: [],
        before: { attack_surface: attackSurface, band },
        after: { attack_surface: 1.5, band: 'LOW' },
        invariants: {},
        accepted: true,
        reason: null,
      },
    ],
    best_patch_id: 'patch-sg-revoke-redis-6379',
  }
}

const attackResult: AttackResult = {
  entry_type: 'public_service',
  entry_node: 'internet',
  paths: {
    'demo-data': { path: ['internet', 'redis', 'host', 'imds', 'role', 'demo-data'], hops: 5, mitre: ['T1190', 'T1552.005'], potential: true },
  },
  blast_radius: 4,
}

const failureResult: FailureResult = {
  node: 'redis',
  affected_services: { redis: 'down', api: 'degraded' },
  affected_endpoints: { '/checkout': 'FAILED', '/products': 'DEGRADED' },
  critical_paths: {},
  recovery_order: ['redis', 'api'],
}

afterEach(() => vi.restoreAllMocks())

describe('IncidentStory', () => {
  it('walks through the real beats, showing real returned data at each step', async () => {
    vi.spyOn(api, 'replayReset').mockResolvedValue({ scenario: 'healthy', twin: { nodes: [], edges: [] } })
    vi.spyOn(api, 'replayStep')
      .mockResolvedValueOnce({ scenario: 'latent', twin: { nodes: [], edges: [] } })
      .mockResolvedValueOnce({ scenario: 'exposed', twin: { nodes: [], edges: [] } })
    vi.spyOn(api, 'getFixPreview')
      .mockResolvedValueOnce(finding('latent', 1.5, 'LOW'))
      .mockResolvedValueOnce(finding('exposed', 7.5, 'HIGH'))
      .mockResolvedValueOnce(finding('exposed', 7.5, 'HIGH'))
    vi.spyOn(api, 'simulateAttack').mockResolvedValue(attackResult)
    vi.spyOn(api, 'simulateFailure').mockResolvedValue(failureResult)

    const onClose = vi.fn()
    render(<IncidentStory onClose={onClose} />)

    // Beat 1: healthy
    await waitFor(() => expect(api.replayReset).toHaveBeenCalled())

    // Beat 2: latent
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('latent')).toBeInTheDocument())

    // Beat 3: exposed, real risk numbers
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('7.5')).toBeInTheDocument())
    expect(screen.getByText('HIGH')).toBeInTheDocument()

    // Beat 4: attack path, real returned path + MITRE
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/internet → redis → host → imds → role → demo-data/)).toBeInTheDocument())
    expect(screen.getByText(/T1190/)).toBeInTheDocument()

    // Beat 5: failure, real cascade
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText('/checkout')).toBeInTheDocument())
    expect(screen.getByText('FAILED')).toBeInTheDocument()

    // Beat 6: the fix, real before/after
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/revoke-security-group-ingress/)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /explore the dashboard/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Skip closes immediately without waiting for the story to finish', async () => {
    vi.spyOn(api, 'replayReset').mockResolvedValue({ scenario: 'healthy', twin: { nodes: [], edges: [] } })
    const onClose = vi.fn()
    render(<IncidentStory onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
