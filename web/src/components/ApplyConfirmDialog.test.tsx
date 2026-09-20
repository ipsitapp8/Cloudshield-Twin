import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplyConfirmDialog } from './ApplyConfirmDialog'
import { api, ApiError } from '../api/client'
import type { Patch } from '../api/types'

const patch: Patch = {
  id: 'patch-sg-revoke-redis-6379',
  layer: 'aws',
  target: 'redis',
  op: 'sg_revoke',
  aws_cli: ['aws ec2 revoke-security-group-ingress --group-id sg-1 --protocol tcp --port 6379 --cidr 0.0.0.0/0'],
  iptables: [],
  terraform: null,
  rollback: ['aws ec2 authorize-security-group-ingress --group-id sg-1 --protocol tcp --port 6379 --cidr 0.0.0.0/0'],
  before: { attack_surface: 7.5, band: 'HIGH' },
  after: { attack_surface: 1.5, band: 'LOW' },
  invariants: { not_internet_reachable: true, no_flows_removed: true, port22_and_agent_untouched: true, rollback_exists: true },
  accepted: true,
  reason: null,
}

afterEach(() => vi.restoreAllMocks())

describe('ApplyConfirmDialog', () => {
  it('keeps the apply button disabled until the confirmation checkbox is checked', async () => {
    render(<ApplyConfirmDialog patch={patch} onCancel={() => {}} onApplied={() => {}} />)
    const applyButton = screen.getByRole('button', { name: /approve & apply/i })
    expect(applyButton).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox'))
    expect(applyButton).toBeEnabled()
  })

  it('shows the safety restrictions and the exact aws_cli command, never a free-text command input', () => {
    render(<ApplyConfirmDialog patch={patch} onCancel={() => {}} onApplied={() => {}} />)
    expect(screen.getByText(/port 22 and the agent channel are rejected/i)).toBeInTheDocument()
    expect(screen.getByText(patch.aws_cli[0])).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('only calls api.applyFix (with approve:true) after explicit confirmation, and reports backend success', async () => {
    const applySpy = vi.spyOn(api, 'applyFix').mockResolvedValue({ status: 'applied', patch_id: patch.id })
    const onApplied = vi.fn()
    render(<ApplyConfirmDialog patch={patch} onCancel={() => {}} onApplied={onApplied} />)

    expect(applySpy).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /approve & apply/i }))

    await waitFor(() => expect(applySpy).toHaveBeenCalledWith(patch.id, true))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/backend confirmed/i))
    expect(onApplied).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onApplied).toHaveBeenCalled()
  })

  it('shows an error and does not claim success when the backend rejects the apply', async () => {
    vi.spyOn(api, 'applyFix').mockRejectedValue(new ApiError(400, 'port 22 is protected'))
    const onApplied = vi.fn()
    render(<ApplyConfirmDialog patch={patch} onCancel={() => {}} onApplied={onApplied} />)

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /approve & apply/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('port 22 is protected'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(onApplied).not.toHaveBeenCalled()
  })

  it('cancel never calls the apply endpoint', async () => {
    const applySpy = vi.spyOn(api, 'applyFix')
    const onCancel = vi.fn()
    render(<ApplyConfirmDialog patch={patch} onCancel={onCancel} onApplied={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(applySpy).not.toHaveBeenCalled()
  })
})
