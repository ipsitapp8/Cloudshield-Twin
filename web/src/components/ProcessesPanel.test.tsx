import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProcessesPanel } from './ProcessesPanel'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'

afterEach(() => vi.restoreAllMocks())

describe('ProcessesPanel', () => {
  it('shows "no telemetry" when unavailable', async () => {
    vi.spyOn(api, 'getProcesses').mockResolvedValue({ available: false })
    renderWithLive(<ProcessesPanel />)
    await waitFor(() => expect(screen.getByTestId('processes-unavailable')).toBeInTheDocument())
  })

  it('renders real processes and listeners from the connected agent', async () => {
    vi.spyOn(api, 'getProcesses').mockResolvedValue({
      available: true,
      processes: [
        { pid: 4242, ppid: 1, name: 'hog', exe: null, user: 'app', cpu_percent: 91.5, memory_percent: 4.2, create_time: 0, cmdline: null },
      ],
      listeners: [{ pid: 4242, proc: 'hog', user: 'app', proto: 'tcp', bind: '0.0.0.0', port: 9000 }],
    })
    renderWithLive(<ProcessesPanel />)

    await waitFor(() => expect(screen.getAllByText('hog')).toHaveLength(2)) // process row + listener row
    expect(screen.getByText('4242')).toBeInTheDocument()
    expect(screen.getByText('91.5%')).toBeInTheDocument()
    expect(screen.getByText('9000')).toBeInTheDocument()
    expect(screen.getByText('0.0.0.0')).toBeInTheDocument()
  })
})
