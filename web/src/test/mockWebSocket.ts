/** Minimal controllable fake WebSocket for hook/component tests. Never talks to a real
 * socket -- tests that need "connected" behavior call `instances[0].open()` explicitly. */
export class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  open() {
    this.onopen?.()
  }

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  close() {
    this.closed = true
    this.onclose?.()
  }
}

export function installMockWebSocket() {
  MockWebSocket.instances = []
  // @ts-expect-error -- test double, not a full WebSocket implementation
  globalThis.WebSocket = MockWebSocket
  return MockWebSocket
}
