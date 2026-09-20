import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { api } from './api/client'
import { installMockWebSocket } from './test/mockWebSocket'

afterEach(() => vi.restoreAllMocks())

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

    await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])
    expect(screen.getByRole('button', { name: 'Overview', current: 'page' })).toBeInTheDocument()
  })

  it('renders the Overview section by default and can switch to Remediation', async () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })

    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])
    expect(screen.getByRole('button', { name: 'Overview', current: 'page' })).toBeInTheDocument()

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
    await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])

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
    await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])
    expect(screen.getByTestId('connection-badge')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /step/i })).toBeInTheDocument()
  })

  it('the brand button returns to the landing page', async () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])

    await userEvent.click(screen.getByRole('button', { name: 'CloudShield Twin' }))
    expect(screen.getAllByRole('button', { name: /launch the twin/i }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument()
  })
})
