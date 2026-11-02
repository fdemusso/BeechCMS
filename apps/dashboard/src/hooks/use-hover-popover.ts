// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"

const OPEN_DELAY_MS = 200
const CLOSE_DELAY_MS = 250

/**
 * Hover-driven open state for a Radix Popover: a short delay before opening and before closing, so the
 * pointer can travel from the trigger into the content without the popover flickering shut. Spread
 * `triggerProps` on the trigger AND on the content; wire `open`/`onOpenChange` to the Popover itself.
 */
export function useHoverPopover() {
  const [open, setOpen] = React.useState(false)
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = React.useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  React.useEffect(() => clearTimers, [clearTimers])

  const onPointerEnter = React.useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (!openTimerRef.current) {
      openTimerRef.current = setTimeout(() => {
        setOpen(true)
        openTimerRef.current = null
      }, OPEN_DELAY_MS)
    }
  }, [])

  const onPointerLeave = React.useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (!closeTimerRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setOpen(false)
        closeTimerRef.current = null
      }, CLOSE_DELAY_MS)
    }
  }, [])

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      clearTimers()
      setOpen(next)
    },
    [clearTimers],
  )

  return { open, onOpenChange, triggerProps: { onPointerEnter, onPointerLeave } }
}
