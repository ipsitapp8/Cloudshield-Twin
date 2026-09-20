import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useLiveSocket } from './useLiveSocket'
import { installMockWebSocket, MockWebSocket } from '../test/mockWebSocket'

afterEach(() => {
  MockWebSocket.instances = []
})

describe('useLiveSocket', () => {
  it('starts connecting, then reflects open/close state', async () => {
    installMockWebSocket()
    const { result } = renderHook(() => useLiveSocket())
    expect(result.current.connectionState).toBe('connecting')

    act(() => MockWebSocket.instances[0].open())
    await waitFor(() => expect(result.current.connectionState).toBe('open'))

    act(() => MockWebSocket.instances[0].close())
    await waitFor(() => expect(result.current.connectionState).toBe('closed'))
  })

  it('parses incoming messages and increments messageCount', async () => {
    installMockWebSocket()
    const { result } = renderHook(() => useLiveSocket())
    act(() => MockWebSocket.instances[0].open())

    act(() => MockWebSocket.instances[0].emit({ type: 'REPLAY_STEP', scenario: 'latent' }))
    await waitFor(() => expect(result.current.messageCount).toBe(1))
    expect(result.current.lastMessage).toEqual({ type: 'REPLAY_STEP', scenario: 'latent' })
  })

  it('ignores malformed frames instead of crashing', async () => {
    installMockWebSocket()
    const { result } = renderHook(() => useLiveSocket())
    act(() => MockWebSocket.instances[0].open())
    act(() => MockWebSocket.instances[0].onmessage?.({ data: 'not json' }))

    expect(result.current.messageCount).toBe(0)
  })
})
