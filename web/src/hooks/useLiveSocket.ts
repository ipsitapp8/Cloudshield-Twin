import { useEffect, useState } from 'react'
import { WS_URL } from '../api/client'

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error'

export interface LiveMessage {
  type: string
  [key: string]: unknown
}

/** Subscribes to backend WS /ws. Exposes connection health plus the latest message,
 * so panels can opt into "refetch when something changed" via messageCount. */
export function useLiveSocket() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [lastMessage, setLastMessage] = useState<LiveMessage | null>(null)
  const [messageCount, setMessageCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    let socket: WebSocket

    try {
      socket = new WebSocket(WS_URL)
    } catch {
      setConnectionState('error')
      return
    }

    socket.onopen = () => {
      if (!cancelled) setConnectionState('open')
    }
    socket.onclose = () => {
      if (!cancelled) setConnectionState('closed')
    }
    socket.onerror = () => {
      if (!cancelled) setConnectionState('error')
    }
    socket.onmessage = (event) => {
      if (cancelled) return
      try {
        const data = JSON.parse(event.data as string) as LiveMessage
        setLastMessage(data)
        setMessageCount((count) => count + 1)
      } catch {
        // ignore malformed frames rather than crash the UI
      }
    }

    return () => {
      cancelled = true
      socket.close()
    }
  }, [])

  return { connectionState, lastMessage, messageCount }
}
