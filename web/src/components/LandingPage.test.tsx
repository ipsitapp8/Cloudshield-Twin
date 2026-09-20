import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

describe('LandingPage', () => {
  it('renders the pitch and calls onEnter when a CTA is clicked', async () => {
    const onEnter = vi.fn()
    render(<LandingPage onEnter={onEnter} />)

    expect(screen.getByRole('heading', { name: 'CloudShield Twin' })).toBeInTheDocument()
    expect(screen.getByText(/runs fully offline in replay mode/i)).toBeInTheDocument()

    const ctas = screen.getAllByRole('button', { name: /launch the twin/i })
    expect(ctas.length).toBe(2)
    await userEvent.click(ctas[0])
    expect(onEnter).toHaveBeenCalledTimes(1)
  })
})
