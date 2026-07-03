import { useRef, useCallback } from 'react'

const EDGE_PX = 60
const SCROLL_SPEED = 8

export function useKanbanAutoscroll() {
  const rafRef = useRef<number | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const pointerYRef = useRef(0)

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    targetRef.current = null
  }, [])

  const start = useCallback((el: HTMLElement, pointerY: number) => {
    targetRef.current = el
    pointerYRef.current = pointerY

    if (rafRef.current !== null) return

    function tick() {
      const el = targetRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const y = pointerYRef.current
      if (y - rect.top < EDGE_PX) {
        el.scrollTop -= SCROLL_SPEED
      } else if (rect.bottom - y < EDGE_PX) {
        el.scrollTop += SCROLL_SPEED
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const updatePointer = useCallback((pointerY: number) => {
    pointerYRef.current = pointerY
  }, [])

  return { start, stop, updatePointer }
}
