import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExplainPanel } from './ExplainPanel'
import { api } from '../api/client'

afterEach(() => vi.restoreAllMocks())

describe('ExplainPanel', () => {
  it('sends the textarea JSON as structured context and labels a deterministic result', async () => {
    const explainSpy = vi
      .spyOn(api, 'explain')
      .mockResolvedValue({ source: 'template', generated_by: 'deterministic', text: 'redis is exposed.' })

    render(<ExplainPanel />)
    await userEvent.click(screen.getByRole('button', { name: /^explain$/i }))

    await waitFor(() => expect(explainSpy).toHaveBeenCalled())
    expect(explainSpy.mock.calls[0][0]).toMatchObject({ kind: 'finding', node: 'redis' })
    expect(screen.getByText('Deterministic')).toBeInTheDocument()
    expect(screen.getByText('redis is exposed.')).toBeInTheDocument()
  })

  it('labels an AI-generated result distinctly and never as a command', async () => {
    vi.spyOn(api, 'explain').mockResolvedValue({ source: 'bedrock', generated_by: 'ai', text: 'Summary text.' })
    render(<ExplainPanel />)
    await userEvent.click(screen.getByRole('button', { name: /^explain$/i }))
    await waitFor(() => expect(screen.getByText('AI-generated')).toBeInTheDocument())
  })

  it('rejects invalid JSON client-side without calling the backend', async () => {
    const explainSpy = vi.spyOn(api, 'explain')
    render(<ExplainPanel />)
    const textarea = screen.getByLabelText(/explain context json/i)
    fireEvent.change(textarea, { target: { value: '{not valid json' } })
    await userEvent.click(screen.getByRole('button', { name: /^explain$/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/valid json/i)
    expect(explainSpy).not.toHaveBeenCalled()
  })
})
