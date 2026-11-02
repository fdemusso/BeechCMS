// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'

const DURATION_MS = 160

/**
 * A section's height while a field is dragged: it only grows, shrinks at the drop, and moves smoothly.
 *
 * In the layout builder a field lifted out of its column empties that column, and the section it sat in
 * would snap shorter under the pointer — which moves the targets around and, because the dialog is as tall
 * as its content and vertically centred, drags the whole dialog with it. While `active` the section keeps
 * the height it had when the drag began and rises whenever its content outgrows it (a field dragged in);
 * leaving it does not shrink it, whichever section the field goes to next. At the drop it eases to its
 * real height. As no section can shrink mid-drag, the content, and so the dialog, cannot either.
 *
 * Attach `outerRef` to the section's box (the one with the border) and `innerRef` to a wrapper around all
 * its content: the wrapper's height is the content's natural height, which the fixed outer height hides.
 * Spread `style` on the outer box and merge its `transition` with any the box already has.
 */
export function useAnimatedSectionHeight(active: boolean) {
  const outerRef = React.useRef<HTMLElement | null>(null)
  const innerRef = React.useRef<HTMLElement | null>(null)
  const [height, setHeight] = React.useState<number | null>(null)
  const chromeRef = React.useRef(0)
  const lockedRef = React.useRef(false)
  const durationRef = React.useRef(DURATION_MS)
  const currentRef = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    if (active) {
      durationRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DURATION_MS
      // What the box adds around its content (its border), measured while the height is still `auto`.
      chromeRef.current = outer.offsetHeight - inner.offsetHeight
      lockedRef.current = true
      currentRef.current = outer.offsetHeight
      setHeight(currentRef.current)

      // The observer already carries the new size, so nothing here reads layout; and it only touches state
      // when the content really outgrew the section — most callbacks during a drag change nothing.
      const observer = new ResizeObserver(([entry]) => {
        const needed = (entry?.borderBoxSize?.[0]?.blockSize ?? inner.offsetHeight) + chromeRef.current
        if (needed > (currentRef.current ?? 0)) {
          currentRef.current = needed
          setHeight(needed)
        }
      })
      observer.observe(inner)
      return () => observer.disconnect()
    }

    if (lockedRef.current) {
      lockedRef.current = false
      currentRef.current = null
      // Ease to the real height, then hand the box back to `auto` once it has arrived.
      setHeight(inner.offsetHeight + chromeRef.current)
      const timer = window.setTimeout(() => setHeight(null), durationRef.current + 40)
      return () => window.clearTimeout(timer)
    }
  }, [active])

  const style: React.CSSProperties | undefined =
    height === null
      ? undefined
      : { height, overflow: 'hidden', transition: `height ${durationRef.current}ms ease-out` }

  return { outerRef, innerRef, style }
}
