import { useEffect, useRef, useState } from 'react'

/** Tweens a displayed number from its previous value to `target` over `durationMs`,
 * via requestAnimationFrame. No dependency. Falls back to snapping instantly if
 * `target` isn't a finite number (e.g. still loading). */
export function useCountUp(target: number | undefined, durationMs = 600): number | undefined {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    if (target === undefined || !Number.isFinite(target)) {
      setValue(target)
      return
    }
    const from = Number.isFinite(fromRef.current) ? (fromRef.current as number) : target
    const start = performance.now()
    let frame: number

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs)
      const current = from + (target! - from) * progress
      setValue(Math.round(current * 10) / 10)
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}
