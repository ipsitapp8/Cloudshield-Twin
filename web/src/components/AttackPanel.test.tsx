import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttackPanel } from './AttackPanel'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'
import type { AttackResult, TwinGraph } from '../api/types'

const graph: TwinGraph = {
  nodes: [
    { id: 'internet', kind: 'internet', ports: [], tier: 0, sensitivity: 0, state: 'ok' },
    { id: 'redis', kind: 'datastore', ports: [6379], tier: 2, sensitivity: 2, state: 'ok' },
    { id: 'demo-data', kind: 'aws_bucket', ports: [], tier: 3, sensitivity: 3, state: 'ok' },
  ],
  edges: [],
}

const attackResult: AttackResult = {
  entry_type: 'public_service',
  entry_node: 'internet',
  paths: {
    'demo-data': { path: ['internet', 'redis', 'demo-data'], hops: 2, mitre: ['T1190', 'T1552.005'], potential: true },
  },
  blast_radius: 3,
}

afterEach(() => vi.restoreAllMocks())

describe('AttackPanel', () => {
  it('renders the backend attack path (nodes, hops, MITRE ids) after simulating', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue(graph)
    vi.spyOn(api, 'simulateAttack').mockResolvedValue(attackResult)

    renderWithLive(<AttackPanel />)
    await waitFor(() => expect(screen.getByLabelText(/entry node/i)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /simulate attack/i }))

    await waitFor(() =>
      expect(screen.getByText('internet → redis → demo-data')).toBeInTheDocument(),
    )
    expect(screen.getByText('T1190')).toBeInTheDocument()
    expect(screen.getByText('T1552.005')).toBeInTheDocument()
    expect(screen.getByText(/blast radius/i)).toHaveTextContent('3')
  })

  it('shows an empty message when no path to a sensitive asset exists', async () => {
    vi.spyOn(api, 'getTwin').mockResolvedValue(graph)
    vi.spyOn(api, 'simulateAttack').mockResolvedValue({ ...attackResult, paths: {}, blast_radius: 0 })

    renderWithLive(<AttackPanel />)
    await waitFor(() => expect(screen.getByLabelText(/entry node/i)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /simulate attack/i }))

    await waitFor(() => expect(screen.getByText(/no path to any sensitive asset/i)).toBeInTheDocument())
  })
})
