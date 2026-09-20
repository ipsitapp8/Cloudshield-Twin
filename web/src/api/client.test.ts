import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, BackendUnavailableError, api } from './client'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('parses a successful JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ nodes: [], edges: [] })))
    const twin = await api.getTwin()
    expect(twin).toEqual({ nodes: [], edges: [] })
  })

  it('throws ApiError with the backend detail message on 4xx/5xx', async () => {
    // a fresh Response per call: Response bodies can only be read once
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => jsonResponse({ detail: 'unknown node' }, 404)),
    )
    const error = await api.simulateFailure('nope').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toHaveProperty('status', 404)
    expect(error).toHaveProperty('message', 'unknown node')
  })

  it('throws BackendUnavailableError when fetch itself rejects (network/offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.getTwin()).rejects.toBeInstanceOf(BackendUnavailableError)
  })

  it('sends the exact endpoints/methods for apply and rollback (no arbitrary commands)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'applied', patch_id: 'p1' }))
    vi.stubGlobal('fetch', fetchMock)

    await api.applyFix('p1', true)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/fix/p1/apply'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ approve: true }) }),
    )
  })

  it('builds /probe query params correctly, host optional', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ host: '1.2.3.4', port: 6379, status: 'unreachable', reason: 'timeout', elapsed_ms: 5 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await api.probe(6379)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/probe?port=6379'), expect.anything())
  })
})
