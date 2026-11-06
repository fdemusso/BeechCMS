// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * The line under the active tab of a `line` TabsList, slid from one tab to the next. It sits inside the list (which must be
 * `relative`), measures the trigger Radix marks `data-state="active"`, and follows it when the tabs change or resize.
 */
export function SlidingTabIndicator({ activeValue, className }: { activeValue: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [box, setBox] = React.useState<{ left: number; width: number } | null>(null)
  // The first position is set without animation: the line must not fly in from the corner when the dialog opens.
  const [animated, setAnimated] = React.useState(false)

  React.useLayoutEffect(() => {
    const list = ref.current?.parentElement
    if (!list) return
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      if (active) setBox({ left: active.offsetLeft, width: active.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    list.querySelectorAll('[role="tab"]').forEach((tab) => observer.observe(tab))
    return () => observer.disconnect()
  }, [activeValue])

  React.useEffect(() => {
    if (box && !animated) {
      const frame = requestAnimationFrame(() => setAnimated(true))
      return () => cancelAnimationFrame(frame)
    }
  }, [box, animated])

  return (
    <span
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-[-1.5px] left-0 h-0.5 bg-foreground",
        animated && "transition-[transform,width] duration-200 ease-out motion-reduce:transition-none",
        !box && "opacity-0",
        className
      )}
      style={box ? { width: box.width, transform: `translateX(${box.left}px)` } : undefined}
    />
  )
}
