import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiChatWidget } from './AiChatWidget'
import { api } from '../api/client'

afterEach(() => vi.restoreAllMocks())

describe('AiChatWidget', () => {
  it('maps "what if <node> is compromised" to a real onAskCompromised call, not a fabricated answer', async () => {
    const onAskCompromised = vi.fn()
    const onAskFailure = vi.fn()
    const explainSpy = vi.spyOn(api, 'explain')

    render(<AiChatWidget nodeIds={['redis', 'api']} onAskCompromised={onAskCompromised} onAskFailure={onAskFailure} />)
    await userEvent.type(screen.getByLabelText(/ask the ai agent/i), 'What if redis is compromised?')
    await userEvent.click(screen.getByRole('button', { name: /ask/i }))

    expect(onAskCompromised).toHaveBeenCalledWith('redis')
    expect(onAskFailure).not.toHaveBeenCalled()
    expect(explainSpy).not.toHaveBeenCalled()
  })

  it('maps "what if <node> fails" to a real onAskFailure call', async () => {
    const onAskCompromised = vi.fn()
    const onAskFailure = vi.fn()

    render(<AiChatWidget nodeIds={['redis', 'api']} onAskCompromised={onAskCompromised} onAskFailure={onAskFailure} />)
    await userEvent.type(screen.getByLabelText(/ask the ai agent/i), 'What happens if api fails?')
    await userEvent.click(screen.getByRole('button', { name: /ask/i }))

    expect(onAskFailure).toHaveBeenCalledWith('api')
    expect(onAskCompromised).not.toHaveBeenCalled()
  })

  it('routes anything unrecognized through the real deterministic /explain, never a fabricated answer', async () => {
    vi.spyOn(api, 'explain').mockResolvedValue({ source: 'template', generated_by: 'deterministic', text: 'No structured context recognized; no explanation generated.' })
    const onAskCompromised = vi.fn()
    const onAskFailure = vi.fn()

    render(<AiChatWidget nodeIds={['redis']} onAskCompromised={onAskCompromised} onAskFailure={onAskFailure} />)
    await userEvent.type(screen.getByLabelText(/ask the ai agent/i), 'How does this whole system work?')
    await userEvent.click(screen.getByRole('button', { name: /ask/i }))

    await waitFor(() => expect(screen.getByText(/no structured context recognized/i)).toBeInTheDocument())
    expect(onAskCompromised).not.toHaveBeenCalled()
    expect(onAskFailure).not.toHaveBeenCalled()
  })
})
