// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback } from "react"
import type { PointerEvent } from "react"

const ITEM_SELECTOR = '[data-sidebar="menu-button"], [data-slot="sidebar-trigger"], [data-rail-item]'
const STATIC_SELECTOR = "[data-rail-static]"
const SCALE_VAR = "--lens-scale"

const PEAK = 1.25 // icon under the pointer
const REST = 0.97 // far icons: the effect never fully goes away
const DIP = 0.08 // extra shrink right next to the pointer; fades with distance
const REACH_PX = 70 // distance over which the extra shrink fades (exponential)
const HOVER_HALF_PX = 19 // half the icon pitch: nearest icon within this is "hovered"
const ACTIVE_PX = 26 // pointer further than this from every icon: lens off

function items(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter((el) => !el.closest(STATIC_SELECTOR))
}

function clear(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) el.style.removeProperty(SCALE_VAR)
}

/**
 * Dock-style lens for the icon rail: the icon under the pointer grows, the others shrink slightly, less the further
 * they are (vertical distance), down to a small shrink that is always there while the lens is active.
 * Sets `--lens-scale` on each item; index.css turns it into the transform. Pointer (mouse) only.
 */
export function useRailLens(enabled: boolean) {
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const root = event.currentTarget
      if (!enabled || event.pointerType !== "mouse" || (event.target as Element).closest(STATIC_SELECTOR)) {
        clear(root)
        return
      }

      const measured = items(root).map((el) => {
        const box = el.getBoundingClientRect()
        // Scaling is around the centre, so the centre does not move as the icon grows.
        return { el, distance: Math.abs(event.clientY - (box.top + box.height / 2)) }
      })
      const nearest = measured.reduce<(typeof measured)[number] | undefined>(
        (best, item) => (best === undefined || item.distance < best.distance ? item : best),
        undefined,
      )
      if (nearest === undefined || nearest.distance > ACTIVE_PX) {
        clear(root)
        return
      }

      for (const { el, distance } of measured) {
        const scale = el === nearest.el && distance <= HOVER_HALF_PX ? PEAK : REST - DIP * Math.exp(-distance / REACH_PX)
        el.style.setProperty(SCALE_VAR, scale.toFixed(3))
      }
    },
    [enabled],
  )

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => clear(event.currentTarget), [])

  return { onPointerMove, onPointerLeave }
}
