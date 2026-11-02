// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'

const DURATION_MS = 160

/**
 * Eases a section from the height it had when an item was picked up to the height it has once the item has been
 * dropped. While the item is in flight it does nothing: the drag moves nothing, so no section changes size and
 * there is nothing to hold still.
 *
 * It exists for a host whose box is as tall as its content and vertically centred (the entry dialog). Dropping a
 * field in another section makes two sections change height in one frame, and the whole box recentres with them;
 * the ease turns that jump into a short motion. It is a Web Animation on the element, so it leaves no inline style
 * behind and cannot fight the sortable's own `transform` and `transition`. Reduced motion skips it.
 *
 * Attach the returned ref to the section's box (the one with the border).
 */
export function useAnimatedSectionHeight(dragging: boolean, enabled: boolean) {
  const ref = React.useRef<HTMLElement | null>(null)
  const heightBeforeRef = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    const element = ref.current
    if (!enabled || !element) return

    if (dragging) {
      // One read per section at pick-up; nothing is measured while the pointer moves.
      heightBeforeRef.current = element.offsetHeight
      return
    }

    const from = heightBeforeRef.current
    heightBeforeRef.current = null
    if (from === null) return
    const to = element.offsetHeight
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (from === to || reduceMotion || typeof element.animate !== 'function') return

    // Height is the point here: the box really changes size in one frame, and the ease bridges that jump.
    // react-doctor-disable-next-line no-layout-property-animation
    element.animate(
      [
        // react-doctor-disable-next-line no-layout-property-animation
        { height: `${from}px`, overflow: 'hidden' },
        { height: `${to}px`, overflow: 'hidden' },
      ],
      { duration: DURATION_MS, easing: 'ease-out' },
    )
  }, [dragging, enabled])

  return ref
}
