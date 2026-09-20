// Phase 4: a genuine integration test for the frontend. Unlike the Phase 3 component
// tests (which stub the `api` module directly), this stubs `fetch` with FakeBackend and
// exercises the real App, the real api client, and the real component tree together --
// closest approximation of engine->backend->frontend without spinning up a live server.
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { FakeBackend, installFakeBackendFetch } from './test/fakeBackend'
import { installMockWebSocket, MockWebSocket } from './test/mockWebSocket'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('integration: engine -> backend -> frontend (fake HTTP + WS)', () => {
  it('walks healthy -> latent -> exposed -> fixed, updating the UI live without a page reload', async () => {
    const backend = new FakeBackend()
    installFakeBackendFetch(backend)
    installMockWebSocket()
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload: reloadSpy }, writable: true })

    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])
    act(() => MockWebSocket.instances[0].open())

    // -- 1. HEALTHY: redis renders, not falsely exposed ------------------------------
    await userEvent.click(screen.getByRole('button', { name: 'Remediation' }))
    await waitFor(() => expect(screen.getByText('redis')).toBeInTheDocument())
    const redisRow = screen.getByText('redis').closest('li')!
    await userEvent.click(within(redisRow).getByRole('button', { name: /inspect/i }))
    await waitFor(() => expect(screen.getByTestId('finding-status')).toHaveTextContent('closed'))
    expect(screen.getByTestId('finding-status')).not.toHaveTextContent('exposed')

    // -- 2. LATENT: replay step, panel updates live via the WS broadcast -------------
    await userEvent.click(screen.getByRole('button', { name: /step/i }))
    await waitFor(() => expect(backend.scenario).toBe('latent'))
    act(() => MockWebSocket.instances[0].emit({ type: 'REPLAY_STEP', scenario: 'latent' }))
    await waitFor(() => expect(screen.getByTestId('finding-status')).toHaveTextContent('latent'))
    expect(screen.getByTestId('finding-status')).not.toHaveTextContent('exposed')

    // -- 3. EXPOSED: 3-layer evidence + risk numbers reach the UI ---------------------
    await userEvent.click(screen.getByRole('button', { name: /step/i }))
    await waitFor(() => expect(backend.scenario).toBe('exposed'))
    act(() => MockWebSocket.instances[0].emit({ type: 'REPLAY_STEP', scenario: 'exposed' }))
    await waitFor(() => expect(screen.getByTestId('finding-status')).toHaveTextContent('exposed'))

    // -- live toast: the NEW_EXPOSURE drift event surfaces immediately, not just in the Events tab
    await waitFor(() => expect(screen.getByText(/new exposure.*redis/i)).toBeInTheDocument())

    const acceptedRow = screen.getByText('patch-sg-revoke-redis-6379').closest('li')!
    expect(within(acceptedRow).getByTestId('risk-before')).toHaveTextContent('attack_surface=7.5')
    expect(within(acceptedRow).getByTestId('risk-after')).toHaveTextContent('attack_surface=1.5')

    // rejected candidate is visibly distinguished from the accepted one
    const rejectedRow = screen.getByText('patch-iptables-drop-redis-6379').closest('li')!
    expect(within(rejectedRow).getByText('rejected')).toBeInTheDocument()
    expect(within(rejectedRow).queryByRole('button', { name: /review & apply/i })).not.toBeInTheDocument()

    // -- 5/7. REMEDIATION + APPLY: explicit confirmation required, backend confirms --
    await userEvent.click(within(acceptedRow).getByRole('button', { name: /review & apply/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /approve & apply/i })).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('checkbox'))
    await userEvent.click(within(dialog).getByRole('button', { name: /approve & apply/i }))
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(/backend confirmed/i))
    expect(backend.sgRevoked).toBe(true)

    // -- REPLAY to fixed: UI reflects the post-apply state, all through React state --
    await userEvent.click(screen.getByRole('button', { name: /step/i }))
    await waitFor(() => expect(backend.scenario).toBe('fixed'))
    act(() => MockWebSocket.instances[0].emit({ type: 'REPLAY_STEP', scenario: 'fixed' }))
    await waitFor(() => expect(screen.getByTestId('finding-status')).toHaveTextContent('internal'))

    // -- 10. never a full page reload anywhere in this flow ---------------------------
    expect(reloadSpy).not.toHaveBeenCalled()

    // -- 9. probe never claims success/failure it cannot back up ---------------------
    await userEvent.click(screen.getByRole('button', { name: 'Infrastructure' }))
    await userEvent.click(screen.getByRole('button', { name: 'Probe' }))
    vi.stubGlobal('fetch', backendFetchWithProbe(backend, 'unknown'))
    const probeSection = screen.getByRole('heading', { name: /external probe/i }).closest('section')!
    await userEvent.click(within(probeSection).getByRole('button', { name: /^probe$/i }))
    await waitFor(() => expect(screen.getByText(/ambiguous result/i)).toBeInTheDocument())
  })

  it('4. FAILURE: simulating a redis failure shows api degraded, /checkout FAILED, /products DEGRADED', async () => {
    const backend = new FakeBackend()
    installFakeBackendFetch(backend)
    installMockWebSocket()

    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])
    act(() => MockWebSocket.instances[0].open())

    await userEvent.click(screen.getByRole('button', { name: 'Simulation' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /node to fail/i }), 'redis')
    await userEvent.click(screen.getByRole('button', { name: /simulate failure/i }))

    const main = screen.getByRole('main')
    await waitFor(() => expect(within(main).getByTestId('failure-stat-services')).toBeInTheDocument())
    expect(within(main).getByTestId('failure-stat-services')).toHaveTextContent('2')
    expect(within(main).getByTestId('failure-stat-endpoints')).toHaveTextContent('2')
    expect(within(main).getByTestId('failure-stat-paths')).toHaveTextContent('1')

    const apiRow = within(main).getByText('api', { selector: 'span.font-mono' }).closest('li')!
    expect(within(apiRow).getByText('degraded')).toBeInTheDocument()

    const checkoutRow = within(main).getByText('/checkout').closest('li')!
    expect(within(checkoutRow).getByText('FAILED')).toBeInTheDocument()
    const productsRow = within(main).getByText('/products').closest('li')!
    expect(within(productsRow).getByText('DEGRADED')).toBeInTheDocument()
  })

  it('surfaces a clear backend-unavailable state instead of silently showing nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    installMockWebSocket()

    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /launch the twin/i })[0])
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/backend unavailable/i))
  })
})

// probe isn't part of FakeBackend's main dispatcher (it's a GET with query params handled
// the same way as everything else) -- this tiny helper swaps in a probe-only response for
// the one test that needs to prove an ambiguous probe result is never read as success.
function backendFetchWithProbe(_backend: FakeBackend, status: 'reachable' | 'unreachable' | 'unknown') {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({ host: '3.91.100.20', port: 6379, status, reason: status === 'unknown' ? 'network is unreachable' : null, elapsed_ms: 5 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  )
}
