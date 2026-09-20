import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectVM } from './ConnectVM'
import { api, BackendUnavailableError } from '../api/client'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ConnectVM', () => {
  it('shows the gate, registers, and displays the exact run command', async () => {
    vi.spyOn(api, 'getConnection').mockResolvedValue({
      mode: 'unconnected',
      connected: false,
      agent_id: null,
      hostname: null,
      last_seen_seconds_ago: null,
    })
    vi.spyOn(api, 'registerAgent').mockResolvedValue({ agent_id: 'agent-abc123', token: 'sekrit-token' })

    const onConnected = vi.fn()
    render(<ConnectVM onConnected={onConnected} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /connect a vm/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /connect a vm/i }))

    await waitFor(() => expect(screen.getByText(/waiting for agent/i)).toBeInTheDocument())
    expect(screen.getByText(/python -m agent\.agent/)).toHaveTextContent('--token sekrit-token')
    expect(screen.getByText(/agent-abc123/)).toBeInTheDocument()
    expect(onConnected).not.toHaveBeenCalled()
  })

  it('transitions to the dashboard once the agent actually connects', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const getConnection = vi
      .spyOn(api, 'getConnection')
      .mockResolvedValueOnce({ mode: 'unconnected', connected: false, agent_id: null, hostname: null, last_seen_seconds_ago: null })
      .mockResolvedValue({ mode: 'live', connected: true, agent_id: 'agent-abc123', hostname: 'real-host', last_seen_seconds_ago: 1 })
    vi.spyOn(api, 'registerAgent').mockResolvedValue({ agent_id: 'agent-abc123', token: 'sekrit-token' })

    const onConnected = vi.fn()
    render(<ConnectVM onConnected={onConnected} />)

    await vi.waitFor(() => expect(screen.getByRole('button', { name: /connect a vm/i })).toBeInTheDocument())
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: /connect a vm/i }))
    await vi.waitFor(() => expect(screen.getByText(/waiting for agent/i)).toBeInTheDocument())

    await vi.advanceTimersByTimeAsync(2100)
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalled())
    expect(getConnection).toHaveBeenCalled()
  })

  it('skips the gate immediately if a session is already connected', async () => {
    vi.spyOn(api, 'getConnection').mockResolvedValue({
      mode: 'demo',
      connected: false,
      agent_id: null,
      hostname: null,
      last_seen_seconds_ago: null,
    })

    const onConnected = vi.fn()
    render(<ConnectVM onConnected={onConnected} />)

    await waitFor(() => expect(onConnected).toHaveBeenCalled())
  })

  it('the demo escape hatch activates replay mode and connects immediately', async () => {
    vi.spyOn(api, 'getConnection').mockResolvedValue({
      mode: 'unconnected',
      connected: false,
      agent_id: null,
      hostname: null,
      last_seen_seconds_ago: null,
    })
    const replayReset = vi.spyOn(api, 'replayReset').mockResolvedValue({ scenario: 'healthy', twin: { nodes: [], edges: [] } })

    const onConnected = vi.fn()
    render(<ConnectVM onConnected={onConnected} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /demo \/ replay mode/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /demo \/ replay mode/i }))

    expect(replayReset).toHaveBeenCalled()
    await waitFor(() => expect(onConnected).toHaveBeenCalled())
  })

  it('shows a clear backend-unavailable alert instead of silently showing the gate', async () => {
    vi.spyOn(api, 'getConnection').mockRejectedValue(new BackendUnavailableError(new TypeError('Failed to fetch')))

    render(<ConnectVM onConnected={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/backend unavailable/i))
  })
})
