import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useLive } from './LiveContext'

export interface Toast {
  id: string
  text: string
  tone: 'exposure' | 'live'
  leaving?: boolean
}

const TOAST_LIFETIME_MS = 4500
const TOAST_EXIT_MS = 250

const DRIFT_TYPES = new Set(['NEW_EXPOSURE', 'NEW_LISTENER', 'NEW_FLOW', 'REMOVED'])

function describeDrift(type: string, target: unknown): string {
  const who = typeof target === 'string' ? target : 'a service'
  if (type === 'NEW_EXPOSURE') return `New exposure: ${who} is now reachable`
  if (type === 'NEW_LISTENER') return `New listener detected: ${who}`
  if (type === 'NEW_FLOW') return `New network flow observed: ${who}`
  return `${who} was removed from the twin`
}

function describeLiveMessage(type: string, message: Record<string, unknown>): string | null {
  if (type === 'REPLAY_STEP' || type === 'REPLAY_RESET') {
    return `Replay: now ${String(message.scenario ?? '?')}`
  }
  if (type === 'PATCH_APPLIED') {
    return `Patch applied: ${String(message.patch_id ?? '')}`
  }
  if (type === 'PATCH_ROLLED_BACK') {
    return `Rolled back: ${String(message.patch_id ?? '')}`
  }
  return null
}

/** Surfaces WS activity as transient toasts. REPLAY_STEP/PATCH_APPLIED/PATCH_ROLLED_BACK
 * are already pushed over the socket and read straight off lastMessage. Drift events
 * (NEW_EXPOSURE etc.) are NOT broadcast directly -- they only land in the events table --
 * so those are surfaced by diffing GET /events against the highest id already seen. */
export function useEventToasts(): Toast[] {
  const { lastMessage, messageCount } = useLive()
  const [toasts, setToasts] = useState<Toast[]>([])
  const seenEventId = useRef(0)
  const seenMessageCount = useRef(0)
  const baselineSet = useRef(false)

  function push(text: string, tone: Toast['tone']) {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, text, tone }])
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_EXIT_MS)
    }, TOAST_LIFETIME_MS)
  }

  useEffect(() => {
    if (!lastMessage || messageCount === seenMessageCount.current) return
    seenMessageCount.current = messageCount
    const text = describeLiveMessage(lastMessage.type, lastMessage)
    if (text) push(text, 'live')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount])

  useEffect(() => {
    api
      .getEvents(20)
      .then((events) => {
        const highest = events.length > 0 ? Math.max(...events.map((e) => e.id)) : 0
        if (!baselineSet.current) {
          // First fetch just establishes the baseline -- events that already happened
          // before this page loaded must never flood in as toasts on mount.
          baselineSet.current = true
          seenEventId.current = highest
          return
        }
        const fresh = events.filter((e) => e.id > seenEventId.current && DRIFT_TYPES.has(e.type))
        seenEventId.current = Math.max(seenEventId.current, highest)
        for (const e of fresh.slice().reverse()) {
          push(describeDrift(e.type, e.payload.target), 'exposure')
        }
      })
      .catch(() => {
        // best-effort notification layer -- a failed events fetch shouldn't disrupt the UI
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount])

  return toasts
}
