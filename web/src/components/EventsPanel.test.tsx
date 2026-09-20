import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventsPanel } from './EventsPanel'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'
import { MockWebSocket } from '../test/mockWebSocket'

afterEach(() => vi.restoreAllMocks())

describe('EventsPanel', () => {
  it('renders events from GET /events', async () => {
    vi.spyOn(api, 'getEvents').mockResolvedValue([
      { id: 1, ts: 1700000000, type: 'NEW_EXPOSURE', payload: { target: 'redis' } },
    ])
    renderWithLive(<EventsPanel />)
    await waitFor(() => expect(screen.getByText('NEW_EXPOSURE')).toBeInTheDocument())
  })

  it('shows an empty state with zero events', async () => {
    vi.spyOn(api, 'getEvents').mockResolvedValue([])
    renderWithLive(<EventsPanel />)
    await waitFor(() => expect(screen.getByText(/no events yet/i)).toBeInTheDocument())
  })

  it('refetches events when a WebSocket message arrives (requirement 12)', async () => {
    const getEvents = vi
      .spyOn(api, 'getEvents')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, ts: 1700000000, type: 'PATCH_APPLIED', payload: {} }])

    renderWithLive(<EventsPanel />)
    await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument()

    act(() => {
      MockWebSocket.instances[0].open()
      MockWebSocket.instances[0].emit({ type: 'PATCH_APPLIED', patch_id: 'p1' })
    })

    await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('PATCH_APPLIED')).toBeInTheDocument())
  })
})
