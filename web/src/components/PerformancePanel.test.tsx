import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PerformancePanel } from './PerformancePanel'
import { renderWithLive } from '../test/renderWithLive'
import { api } from '../api/client'
import type { PerformanceResult } from '../api/types'

afterEach(() => vi.restoreAllMocks())

describe('PerformancePanel', () => {
  it('shows a clear DEMO message instead of fabricated numbers when unavailable', async () => {
    vi.spyOn(api, 'getPerformance').mockResolvedValue({ available: false, source: 'demo', reason: 'no live telemetry yet' })
    renderWithLive(<PerformancePanel />)
    await waitFor(() => expect(screen.getByTestId('performance-unavailable')).toBeInTheDocument())
    expect(screen.getByTestId('performance-unavailable')).toHaveTextContent('no live telemetry yet')
  })

  it('shows the real observed numbers, conclusion, and evidence when live', async () => {
    const result: PerformanceResult = {
      available: true,
      source: 'live',
      observed: { cpu_percent: 96, memory_percent: 40 },
      findings: [
        {
          type: 'CPU_BOTTLENECK',
          evidence: ['CPU utilization = 96%', 'process hog (pid 4242) = 90%'],
          confidence: 'high',
          explanation: 'Process hog (pid 4242) is the dominant observed CPU consumer at 90%.',
        },
      ],
      explanation: 'Process hog (pid 4242) is the dominant observed CPU consumer at 90%.',
      history: { series: [], trend: null },
    }
    vi.spyOn(api, 'getPerformance').mockResolvedValue(result)
    renderWithLive(<PerformancePanel />)

    await waitFor(() => expect(screen.getByTestId('performance-explanation')).toHaveTextContent('hog'))
    expect(screen.getByText('CPU_BOTTLENECK')).toBeInTheDocument()
    expect(screen.getByText('CPU utilization = 96%')).toBeInTheDocument()
  })
})
