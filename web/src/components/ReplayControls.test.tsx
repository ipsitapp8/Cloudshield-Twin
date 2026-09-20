import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReplayControls } from './ReplayControls'
import { api } from '../api/client'
import type { TwinGraph } from '../api/types'

const emptyTwin: TwinGraph = { nodes: [], edges: [] }

afterEach(() => vi.restoreAllMocks())

describe('ReplayControls', () => {
  it('starts on healthy and advances healthy -> latent -> exposed -> fixed on Step', async () => {
    const stepSpy = vi
      .spyOn(api, 'replayStep')
      .mockResolvedValueOnce({ scenario: 'latent', twin: emptyTwin })
      .mockResolvedValueOnce({ scenario: 'exposed', twin: emptyTwin })
      .mockResolvedValueOnce({ scenario: 'fixed', twin: emptyTwin })

    render(<ReplayControls />)
    const stepButton = screen.getByRole('button', { name: /step/i })

    await userEvent.click(stepButton)
    await waitFor(() => expect(stepSpy).toHaveBeenCalledTimes(1))

    await userEvent.click(stepButton)
    await userEvent.click(stepButton)
    await waitFor(() => expect(stepSpy).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(stepButton).toBeDisabled())
  })

  it('reset calls POST /replay/reset and returns the scenario indicator to healthy', async () => {
    vi.spyOn(api, 'replayStep').mockResolvedValue({ scenario: 'latent', twin: emptyTwin })
    const resetSpy = vi.spyOn(api, 'replayReset').mockResolvedValue({ scenario: 'healthy', twin: emptyTwin })

    render(<ReplayControls />)
    await userEvent.click(screen.getByRole('button', { name: /step/i }))
    await userEvent.click(screen.getByRole('button', { name: /reset/i }))

    await waitFor(() => expect(resetSpy).toHaveBeenCalled())
  })

  it('shows an error if a replay step fails against a live backend', async () => {
    vi.spyOn(api, 'replayStep').mockRejectedValue(new Error('no active replay session'))
    render(<ReplayControls />)
    await userEvent.click(screen.getByRole('button', { name: /step/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no active replay session/i))
  })
})
