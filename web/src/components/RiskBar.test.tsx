import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RiskBar } from './RiskBar'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'
import type { FixPreview } from '../api/types'
import { MockWebSocket } from '../test/mockWebSocket'

function preview(attackSurface: number, band: string): FixPreview {
  return {
    finding: { id: 'exposure-redis', node: 'redis', status: 'exposed', evidence: {}, confidence: 'high' },
    candidates: [
      {
        id: 'patch-sg-revoke-redis-6379',
        layer: 'aws',
        target: 'redis',
        op: 'sg_revoke',
        aws_cli: [],
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

afterEach(() => vi.restoreAllMocks())

describe('RiskBar', () => {
  it('shows the current computed attack surface and band, and updates live', async () => {
    const spy = vi.spyOn(api, 'getFixPreview').mockResolvedValue(preview(7.5, 'HIGH'))

    renderWithLive(<RiskBar />)
    await waitFor(() => expect(screen.getByTestId('risk-bar')).toHaveTextContent('7.5'))
    expect(screen.getByTestId('risk-bar')).toHaveTextContent('HIGH')

    spy.mockResolvedValue(preview(1.5, 'LOW'))
    act(() => MockWebSocket.instances[0].open())
    act(() => MockWebSocket.instances[0].emit({ type: 'PATCH_APPLIED', patch_id: 'patch-sg-revoke-redis-6379' }))

    await waitFor(() => expect(screen.getByTestId('risk-bar')).toHaveTextContent('1.5'))
    expect(screen.getByTestId('risk-bar')).toHaveTextContent('LOW')
  })
})
