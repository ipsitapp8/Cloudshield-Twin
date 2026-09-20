import { useEventToasts } from '../hooks/useEventToasts'

const TONE_CLASS: Record<string, string> = {
  exposure: 'border-red-700 bg-red-950/90 text-red-100',
  live: 'border-purple-700 bg-purple-950/90 text-purple-100',
}

/** Mounted once at the app shell. Makes WS activity visible in the moment it happens,
 * instead of only being discoverable by opening the Events tab. */
export function ToastStack() {
  const toasts = useEventToasts()

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`rounded border px-3 py-2 text-xs shadow-lg ${TONE_CLASS[toast.tone]}`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  )
}
