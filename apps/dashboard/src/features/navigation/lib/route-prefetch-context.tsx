// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import type { FocusEvent, PointerEvent, ReactNode } from "react"

type Prefetch = (to: string) => void

/** How long the pointer must rest on a link before its page is warmed (hover is not yet intent while sweeping past). */
const HOVER_DWELL_MS = 75

const RoutePrefetchContext = createContext<Prefetch>(() => undefined)

/**
 * Lets the composition root hand navigation a way to warm a route (its code and first requests) without this slice
 * knowing which pages or data exist.
 */
export function RoutePrefetchProvider({ prefetch, children }: { readonly prefetch: Prefetch; readonly children: ReactNode }) {
  return <RoutePrefetchContext.Provider value={prefetch}>{children}</RoutePrefetchContext.Provider>
}

/** Warms `to` (router-relative path). Safe to call often: the prefetch itself dedupes. */
export function usePrefetchRoute(): Prefetch {
  return useContext(RoutePrefetchContext)
}

/** An in-app href (with the router basename) back to the router-relative path the prefetch expects. */
export function toRouterPath(href: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "")
  const { pathname, search } = new URL(href, window.location.origin)
  return (base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname) + search
}

/** Link props that warm `to` on keyboard focus right away and on pointer hover after a short dwell. */
export function usePrefetchOnIntent(to: string) {
  const prefetch = usePrefetchRoute()
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return useMemo(
    () => ({
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => prefetch(to), HOVER_DWELL_MS)
      },
      onPointerLeave: () => window.clearTimeout(timer.current),
      onFocus: (_event: FocusEvent) => prefetch(to),
    }),
    [prefetch, to],
  )
}
