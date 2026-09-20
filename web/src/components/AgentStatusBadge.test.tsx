import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentStatusBadge } from './AgentStatusBadge'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'

afterEach(() => vi.restoreAllMocks())

describe('AgentStatusBadge', () => {
  it('shows NO VM CONNECTED before any agent/demo action', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [], mode: 'unconnected', connected: false })
    renderWithLive(<AgentStatusBadge />)
    await waitFor(() => expect(screen.getByTestId('agent-status')).toHaveTextContent('NO VM CONNECTED'))
  })

  it('shows DEMO / REPLAY once demo mode is explicitly activated', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [], mode: 'demo', connected: false })
    renderWithLive(<AgentStatusBadge />)
    await waitFor(() => expect(screen.getByTestId('agent-status')).toHaveTextContent('DEMO / REPLAY'))
  })

  it('shows LIVE with last-seen when a real agent is connected', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue({
      nodes: [],
      edges: [],
      mode: 'live',
      connected: true,
      last_seen_seconds_ago: 2.4,
    })
    renderWithLive(<AgentStatusBadge />)
    await waitFor(() => expect(screen.getByTestId('agent-status')).toHaveTextContent('LIVE'))
    expect(screen.getByTestId('agent-status')).toHaveTextContent('last seen 2s ago')
  })

  it('shows a stale warning once the agent stops sending telemetry', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue({
      nodes: [],
      edges: [],
      mode: 'live',
      connected: false,
      last_seen_seconds_ago: 45,
    })
    renderWithLive(<AgentStatusBadge />)
    await waitFor(() => expect(screen.getByTestId('agent-status')).toHaveTextContent('stale'))
  })
})
