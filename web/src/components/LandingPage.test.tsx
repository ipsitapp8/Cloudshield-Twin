import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

describe('LandingPage', () => {
  it('renders the pitch and calls onEnter when a CTA is clicked', async () => {
    const onEnter = vi.fn()
    render(<LandingPage onEnter={onEnter} />)

    expect(screen.getByText('CloudShield Twin')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: (name) => /see it/i.test(name) && /secure it/i.test(name) }),
    ).toBeInTheDocument()
    expect(screen.getByText(/runs fully offline in replay mode/i)).toBeInTheDocument()

    const launchButtons = screen.getAllByRole('button', { name: /launch the twin/i })
    expect(launchButtons.length).toBeGreaterThanOrEqual(1)
    await userEvent.click(launchButtons[0])
    expect(onEnter).toHaveBeenCalledWith(false)
  })

  it('the demo CTA enters with the guided story flag set', async () => {
    const onEnter = vi.fn()
    render(<LandingPage onEnter={onEnter} />)

    await userEvent.click(screen.getByRole('button', { name: /watch 90-sec demo/i }))
    expect(onEnter).toHaveBeenCalledWith(true)
  })

  it('the nav "Get Started" and "Sign In" both enter the app (no separate auth flow exists)', async () => {
    const onEnter = vi.fn()
    render(<LandingPage onEnter={onEnter} />)

    await userEvent.click(screen.getByRole('button', { name: /get started/i }))
    expect(onEnter).toHaveBeenCalledWith(false)

    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(onEnter).toHaveBeenCalledWith(false)
  })
})
