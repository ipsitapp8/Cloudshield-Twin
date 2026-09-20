import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FindingsPanel } from './FindingsPanel'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'
import type { FixPreview, TwinGraph } from '../api/types'

const graph: TwinGraph = {
  nodes: [
    { id: 'internet', kind: 'internet', ports: [], tier: 0, sensitivity: 0, state: 'ok' },
    { id: 'redis', kind: 'datastore', ports: [6379], tier: 2, sensitivity: 2, state: 'ok', bind: '0.0.0.0' },
  ],
  edges: [],
}

const preview: FixPreview = {
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
      invariants: { not_internet_reachable: true, no_flows_removed: true, port22_and_agent_untouched: true, rollback_exists: true },
      accepted: true,
      reason: null,
    },
  ],
  best_patch_id: 'patch-sg-revoke-redis-6379',
}

afterEach(() => vi.restoreAllMocks())

describe('FindingsPanel', () => {
  it('lists service/datastore nodes as findings, not the internet node', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue(graph)
    renderWithLive(<FindingsPanel />)
    await waitFor(() => expect(screen.getByText('redis')).toBeInTheDocument())
    expect(screen.queryByText('internet')).not.toBeInTheDocument()
  })

  it('expands a finding to show status, evidence, and risk via GET /fix/{finding_id}', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue(graph)
    vi.spyOn(api, 'getFixPreview').mockResolvedValue(preview)
    renderWithLive(<FindingsPanel />)

    await waitFor(() => expect(screen.getByText('redis')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /inspect/i }))

    expect(api.getFixPreview).toHaveBeenCalledWith('exposure-redis')
    await waitFor(() => expect(screen.getByText('exposed')).toBeInTheDocument())
    expect(screen.getByTestId('risk-before')).toHaveTextContent('attack_surface=7.5')
    expect(screen.getByTestId('risk-after')).toHaveTextContent('attack_surface=1.5')
  })
})
