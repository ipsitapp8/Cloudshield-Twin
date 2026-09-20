import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FailurePanel } from './FailurePanel'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'
import type { FailureResult, TwinGraph } from '../api/types'

const graph: TwinGraph = {
  nodes: [
    { id: 'redis', kind: 'datastore', ports: [6379], tier: 2, sensitivity: 2, state: 'ok' },
    { id: 'api', kind: 'service', ports: [3000], tier: 2, sensitivity: 1, state: 'ok' },
  ],
  edges: [],
}

const failureResult: FailureResult = {
  node: 'redis',
  affected_services: { redis: 'down', api: 'degraded' },
  affected_endpoints: { '/checkout': 'FAILED', '/products': 'DEGRADED' },
  critical_paths: { '/checkout': ['redis', 'api'] },
  recovery_order: ['redis', 'api'],
}

afterEach(() => vi.restoreAllMocks())

describe('FailurePanel', () => {
  it('shows a stat summary (affected services/endpoints/critical paths/recovery) after simulating', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue(graph)
    vi.spyOn(api, 'simulateFailure').mockResolvedValue(failureResult)

    renderWithLive(<FailurePanel />)
    await waitFor(() => expect(screen.getByLabelText(/node to fail/i)).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText(/node to fail/i), 'redis')
    await userEvent.click(screen.getByRole('button', { name: /simulate failure/i }))

    await waitFor(() => expect(screen.getByTestId('failure-stat-services')).toBeInTheDocument())
    expect(within(screen.getByTestId('failure-stat-services')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('failure-stat-endpoints')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('failure-stat-paths')).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByTestId('failure-stat-recovery')).getByText('redis')).toBeInTheDocument()
  })
})
