// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { DashboardWidgetInstance } from '@beechcms/core'

/**
 * A small deterministic random sequence (mulberry32) seeded from a widget id. Ghosts vary (bar heights,
 * line lengths) so a dashboard of many widgets does not look stamped, but the variation is a function of the
 * id: the drag overlay draws the same ghost as the original, and re-ordering never reshuffles skeletons.
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let state = h >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `count` integers in `[min, max]`, stable for a given seed. */
export function seededSeries(seed: string, count: number, min: number, max: number): number[] {
  const next = seededRandom(seed)
  return Array.from({ length: count }, () => min + Math.round(next() * (max - min)))
}

/** Slice shares that add up to exactly 100, so the arcs close the ring with no hole and no overlap. */
export function pieShares(seed: string, slices: number): number[] {
  const raw = seededSeries(seed, slices, 12, 40)
  const total = raw.reduce((sum, v) => sum + v, 0)
  return raw.map((v) => (v / total) * 100)
}

/** A widget bound to a seed that has not been picked yet cannot show anything on the dashboard. */
export function widgetNeedsSetup(widget: DashboardWidgetInstance): boolean {
  return widget.config?.seedSlug === ''
}
