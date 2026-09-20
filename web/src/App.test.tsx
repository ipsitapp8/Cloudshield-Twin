import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { api } from './api/client'
import { installMockWebSocket } from './test/mockWebSocket'

afterEach(() => vi.restoreAllMocks())

describe('App', () => {
  it('renders the dashboard tab by default and can switch to Findings', async () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })

    render(<App />)
    expect(screen.getByRole('button', { name: 'Dashboard', current: 'page' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Findings & Fix' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Findings & Fix', current: 'page' })).toBeInTheDocument(),
    )
    expect(screen.getByText(/exposure findings/i)).toBeInTheDocument()
  })

  it('shows the WS connection badge and replay controls in the header', () => {
    installMockWebSocket()
    vi.spyOn(api, 'getTwin').mockResolvedValue({ nodes: [], edges: [] })
    render(<App />)
    expect(screen.getByTestId('connection-badge')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /step/i })).toBeInTheDocument()
  })
})
