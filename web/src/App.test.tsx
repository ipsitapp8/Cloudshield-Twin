import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { api } from './api/client'
import { installMockWebSocket } from './test/mockWebSocket'

beforeEach(() => {
  // A prior action (this session or another tab) already activated demo mode --
  // ConnectVM's initial check should skip straight past the gate in these tests,
  // which are about the dashboard shell, not the connect flow (see ConnectVM.test.tsx).
  vi.spyOn(api, 'getConnection').mockResolvedValue({
    mode: 'demo',
    connected: false,
    agent_id: null,
    hostname: null,
    last_seen_seconds_ago: null,
  })
})

afterEach(() => vi.restoreAllMocks())

async function launchTwin() {
  await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])
  await waitFor(() => expect(screen.getByRole('button', { name: 'Overview', current: 'page' })).toBeInTheDocument())
}

describe('App', () => {
  it('opens on the landing page, and "Launch the Twin" reveals the dashboard', async () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })

    render(<App />)
    expect(screen.getByText('CloudShield Twin')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: (name) => /see it/i.test(name) && /secure it/i.test(name) }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument()

    await launchTwin()
  })

  it('renders the Overview section by default and can switch to Remediation', async () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })

    render(<App />)
    await launchTwin()

    await userEvent.click(screen.getByRole('button', { name: 'Remediation' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remediation', current: 'page' })).toBeInTheDocument(),
    )
    expect(screen.getByText(/exposure findings/i)).toBeInTheDocument()
  })

  it('shows sub-section tabs for a section with more than one panel', async () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })
    render(<App />)
    await launchTwin()

    await userEvent.click(screen.getByRole('button', { name: 'Simulation' }))
    expect(screen.getByRole('button', { name: 'Failure', current: 'page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attack' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Attack' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Attack', current: 'page' })).toBeInTheDocument())
  })

  it('shows the WS connection badge and replay controls in the header', async () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })
    render(<App />)
    await launchTwin()
    expect(screen.getByTestId('connection-badge')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /step/i })).toBeInTheDocument()
  })

  it('the brand button returns to the landing page', async () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })
    render(<App />)
    await launchTwin()

    await userEvent.click(screen.getByRole('button', { name: 'CloudShield Twin' }))
    expect(screen.getAllByRole('button', { name: /launch the twin/i }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument()
  })
})
