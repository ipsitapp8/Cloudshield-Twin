import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { LiveProvider } from '../hooks/LiveContext'
import { installMockWebSocket } from './mockWebSocket'

/** Renders a component that calls useLive() (directly or via a panel), with a
 * MockWebSocket installed so no real network connection is attempted. */
export function renderWithLive(ui: ReactElement) {
  const MockWS = installMockWebSocket()
  const utils = render(<LiveProvider>{ui}</LiveProvider>)
  return { ...utils, MockWS }
}
