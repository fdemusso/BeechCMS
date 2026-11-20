// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback, useEffect, useRef } from "react"
import type { MouseEvent, PointerEvent } from "react"

const ITEM_SELECTOR = '[data-sidebar="menu-button"], [data-slot="sidebar-trigger"], [data-rail-item]'
const STATIC_SELECTOR = "[data-rail-static]"
const SCALE_VAR = "--lens-scale"
const ACTIVE_ATTR = "data-lens-active"
// Same gate as the CSS in index.css: no lens (and no click forwarding) on touch or with reduced motion.
const LENS_MEDIA = "(hover: hover) and (prefers-reduced-motion: no-preference)"

const PEAK = 1.25 // icon the lens is on
const REST = 0.97 // far icons: the effect never fully goes away
const DIP = 0.08 // extra shrink right next to the pointer; fades with distance
const REACH_PX = 70 // distance over which the extra shrink fades (exponential)
const PEAK_REACH_PX = 30 // the nearest icon within this gets the lens: a bit more than half the icon pitch (38px)
const ACTIVE_PX = 38 // pointer further than this from every icon: lens off
const STICKY_PX = 5 // the current icon keeps the lens until another is this much nearer (no flicker on the boundary)
const LOOKAHEAD_MS = 70 // aim ahead of the pointer by its velocity, so the lens is on the icon it is heading to
const LOOKAHEAD_MAX_PX = 22
const INTENT_DWELL_MS = 75 // the lens must rest on one icon this long before it counts as intent (see onIntent)

function items(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter((el) => !el.closest(STATIC_SELECTOR))
}

function clear(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) el.style.removeProperty(SCALE_VAR)
  root.removeAttribute(ACTIVE_ATTR)
}

function lensAllowed(): boolean {
  return typeof window !== "undefined" && window.matchMedia(LENS_MEDIA).matches
}

/**
 * Dock-style lens for the icon rail: the icon under the pointer grows, the others shrink slightly, less the further
 * they are (vertical distance), down to a small shrink that is always there while the lens is active.
 * Sets `--lens-scale` on each item; index.css turns it into the transform. Pointer (mouse) only.
 *
 * Targeting is forgiving, in the way pointing research suggests (expanding targets, bubble cursor, sticky icons):
 * - the lens icon is the *nearest* one, so every pixel between two icons belongs to one of them (no dead gaps);
 * - the pointer's velocity is projected a few px ahead, so the lens lands on the icon the pointer is heading to;
 * - the current icon is sticky at the boundary, so it does not flicker between two icons;
 * - a mouse click anywhere in that area is forwarded to the lens icon: what you see enlarged is what you activate.
 * The scale is a transform, so layout never moves and the icons do not run away from the pointer (the usual Dock
 * problem). Keyboard focus is unaffected by all of this; focus styling lives in index.css.
 */
export function useRailLens(enabled: boolean, onIntent?: (icon: HTMLElement) => void) {
  const lensRef = useRef<HTMLElement | null>(null)
  const intentTimer = useRef<number | undefined>(undefined)
  const onIntentRef = useRef(onIntent)
  // Kept current after each render so the pointer handler (stable, memoised) always calls the latest callback.
  useEffect(() => {
    onIntentRef.current = onIntent
  })
  useEffect(() => () => window.clearTimeout(intentTimer.current), [])
  const lastRef = useRef<{ y: number; t: number; vy: number } | null>(null)

  const reset = useCallback((root: HTMLElement) => {
    window.clearTimeout(intentTimer.current)
    clear(root)
    lensRef.current = null
    lastRef.current = null
  }, [])

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const root = event.currentTarget
      if (!enabled || event.pointerType !== "mouse" || !lensAllowed() || (event.target as Element).closest(STATIC_SELECTOR)) {
        reset(root)
        return
      }

      // Smoothed vertical velocity (px/ms) from the previous move.
      const now = event.timeStamp
      const previous = lastRef.current
      const vy =
        previous && now > previous.t ? 0.5 * previous.vy + 0.5 * ((event.clientY - previous.y) / (now - previous.t)) : 0
      lastRef.current = { y: event.clientY, t: now, vy }
      const aimY = event.clientY + Math.max(-LOOKAHEAD_MAX_PX, Math.min(LOOKAHEAD_MAX_PX, vy * LOOKAHEAD_MS))

      const measured = items(root).map((el) => {
        const box = el.getBoundingClientRect()
        // Scaling is around the centre, so the centre does not move as the icon grows.
        return { el, distance: Math.abs(aimY - (box.top + box.height / 2)) }
      })
      let nearest = measured.reduce<(typeof measured)[number] | undefined>(
        (best, item) => (best === undefined || item.distance < best.distance ? item : best),
        undefined,
      )
      if (nearest === undefined || nearest.distance > ACTIVE_PX) {
        reset(root)
        return
      }
      const current = measured.find((item) => item.el === lensRef.current)
      if (current && current.distance <= nearest.distance + STICKY_PX) nearest = current

      const lensed = nearest.distance <= PEAK_REACH_PX ? nearest.el : null
      if (lensed !== lensRef.current) {
        // The lens landed on another icon: it counts as intent once it stays there (sweeping past is not).
        window.clearTimeout(intentTimer.current)
        if (lensed) intentTimer.current = window.setTimeout(() => onIntentRef.current?.(lensed), INTENT_DWELL_MS)
      }
      lensRef.current = lensed
      root.toggleAttribute(ACTIVE_ATTR, lensed !== null)
      for (const { el, distance } of measured) {
        const scale = el === lensed ? PEAK : REST - DIP * Math.exp(-distance / REACH_PX)
        el.style.setProperty(SCALE_VAR, scale.toFixed(3))
      }
    },
    [enabled, reset],
  )

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => reset(event.currentTarget), [reset])

  // A real mouse click (detail > 0; keyboard clicks have 0, and so does the forwarded one) that did not land on the
  // lens icon itself goes to it, so the whole forgiving area is clickable.
  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    const lensed = lensRef.current
    if (!lensed || event.detail === 0 || lensed.contains(event.target as Node)) return
    if ((event.target as Element).closest(STATIC_SELECTOR)) return
    event.preventDefault()
    event.stopPropagation()
    lensed.click()
  }, [])

  return { onPointerMove, onPointerLeave, onClickCapture }
}
