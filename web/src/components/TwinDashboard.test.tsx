import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TwinDashboard } from './TwinDashboard'
import { renderWithLive } from '../test/renderWithLive'
import { api, BackendUnavailableError } from '../api/client'
import type { TwinGraph } from '../api/types'

const graph: TwinGraph = {
  nodes: [
    { id: 'internet', kind: 'internet', ports: [], tier: 0, sensitivity: 0, state: 'ok' },
    { id: 'redis', kind: 'datastore', ports: [6379], tier: 2, sensitivity: 2, state: 'ok', bind: '0.0.0.0' },
  ],
  edges: [{ src: 'internet', dst: 'redis', kind: 'exposes', port: 6379, observed: true, dep: 'none' }],
}

afterEach(() => vi.restoreAllMocks())

describe('TwinDashboard', () => {
  it('shows a loading state before data arrives', () => {
    vi.spyOn(api, 'getTwin').mockReturnValue(new Promise(() => {}))
    renderWithLive(<TwinDashboard />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('renders twin nodes once GET /twin resolves', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue(graph)
    renderWithLive(<TwinDashboard />)
    await waitFor(() => expect(screen.getAllByText('redis').length).toBeGreaterThan(0))
    expect(screen.getAllByText('internet').length).toBeGreaterThan(0)
    expect(screen.getByTestId('flow-graph')).toBeInTheDocument()
  })

  it('shows a distinct backend-unavailable message when the backend cannot be reached', async () => {
    vi.spyOn(api, 'getTwin').mockRejectedValue(new BackendUnavailableError(new Error('offline')))
    renderWithLive(<TwinDashboard />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/backend unavailable/i))
  })

  it('shows a generic request-failed message for other errors, distinct from backend-unavailable', async () => {
    vi.spyOn(api, 'getTwin').mockRejectedValue(new Error('boom'))
    renderWithLive(<TwinDashboard />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/request failed/i))
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })

  it('shows an empty state for a twin with no nodes', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })
    renderWithLive(<TwinDashboard />)
    await waitFor(() => expect(screen.getByText(/no data/i)).toBeInTheDocument())
  })
})
