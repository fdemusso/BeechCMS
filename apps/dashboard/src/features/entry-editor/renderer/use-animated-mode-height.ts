// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'

const DURATION_MS = 200
/** How long the box stays clipped after arriving; a switch inside this window continues the same motion. */
const GRACE_MS = 120

/**
 * Eases a box between its heights when `mode` flips (entry form <-> layout builder in the same dialog).
 *
 * The box must be a flex item with `flex: 0 1 auto` (no `flex-1`): a flex item's size comes from its
 * `flex-basis`, so with `flex-1` the inline `height` set here is ignored and the switch stays instant.
 *
 * While it moves the box carries `data-resizing`, and the shell uses it to switch off the scrolling inside:
 * a box that is briefly shorter than its content would otherwise flash scrollbars.
 *
 * Only the flip is animated: growth and shrinkage from anything else (a field dragged in, a list loading)
 * stay instant. The box is measured before and after the switch, pinned to the old height, then eased to
 * the new one and handed back to `auto`.
 *
 * Flipping again while it is moving does not restart from the old height: it retargets from wherever the
 * box is, and the box is only released once it has been still for `GRACE_MS`, so repeated clicks read as
 * one continuous motion instead of a series of jumps.
 */
export function useAnimatedModeHeight(mode: boolean) {
  const elRef = React.useRef<HTMLDivElement | null>(null)
  const observerRef = React.useRef<ResizeObserver | null>(null)
  const lastHeightRef = React.useRef<number | null>(null)
  const firstRunRef = React.useRef(true)
  const timerRef = React.useRef<number | undefined>(undefined)

  // A callback ref, not an effect: the dialog's content mounts after this hook first runs (the portal opens
  // later), so an effect on mount would find no element and never record a resting height.
  const ref = React.useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    elRef.current = el
    if (!el) return
    lastHeightRef.current = el.offsetHeight
    // Remember the resting height; skipped while an animation owns the inline height.
    observerRef.current = new ResizeObserver(([entry]) => {
      if (el.style.height) return
      lastHeightRef.current = entry?.borderBoxSize?.[0]?.blockSize ?? null
    })
    observerRef.current.observe(el)
  }, [])

  React.useLayoutEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    const el = elRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    window.clearTimeout(timerRef.current)

    const moving = el.style.height !== ''
    const from = moving ? el.offsetHeight : lastHeightRef.current
    el.style.transition = 'none'
    el.style.height = ''
    const to = el.offsetHeight
    if (from === null || Math.abs(from - to) < 2) {
      el.style.transition = ''
      delete el.dataset.resizing
      return
    }

    el.style.overflow = 'hidden'
    el.dataset.resizing = ''
    el.style.height = `${from}px`
    void el.offsetHeight // commit the starting height before the transition is switched on
    el.style.transition = `height ${DURATION_MS}ms ease-out`
    el.style.height = `${to}px`

    // The new view keeps settling a beat after the switch (fields and ghosts render late), so its natural
    // height can differ from the one measured above. Before letting go, check, and ease the rest of the way.
    let attempts = 0
    const settle = () => {
      const at = el.offsetHeight
      el.style.transition = 'none'
      el.style.height = ''
      const natural = el.offsetHeight
      // Twice at most: a view that never stops changing must not leave the box pinned and clipped.
      if (Math.abs(natural - at) >= 2 && attempts++ < 2) {
        el.style.height = `${at}px`
        void el.offsetHeight
        el.style.transition = `height ${DURATION_MS}ms ease-out`
        el.style.height = `${natural}px`
        timerRef.current = window.setTimeout(settle, DURATION_MS + GRACE_MS)
        return
      }
      el.style.transition = ''
      el.style.overflow = ''
      delete el.dataset.resizing
      // What the box really measures, not the target: a tall view is clamped by the dialog's max height.
      lastHeightRef.current = natural
    }
    timerRef.current = window.setTimeout(settle, DURATION_MS + GRACE_MS)
  }, [mode])

  React.useEffect(() => () => {
    window.clearTimeout(timerRef.current)
    observerRef.current?.disconnect()
  }, [])

  return ref
}
