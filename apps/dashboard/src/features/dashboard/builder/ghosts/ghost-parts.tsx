// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import type { IconComponent } from '@/lib/icon-registry'
import { cn } from '@/lib/utils'

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

export interface GhostShellProps {
  readonly icon?: IconComponent
  readonly title?: string
  /** Small tag after the title (the bound seed). */
  readonly tag?: React.ReactNode
  /** Right side of the header (a date filter, say). */
  readonly action?: React.ReactNode
  /** The real card's minimum height, so a column in the builder is as tall as it will be on the dashboard. */
  readonly minHeight: number
  readonly className?: string
  readonly children: React.ReactNode
}

/**
 * The card a widget sits in, drawn flat: same corner, padding and header as the real `WidgetShell`, without
 * the blur and hover shadows, which are expensive to repaint while a drag moves dozens of them.
 */
export function GhostShell({ icon: Icon, title, tag, action, minHeight, className, children }: GhostShellProps) {
  const hasHeader = Boolean(Icon || title || action)
  return (
    <div
      className={cn('flex h-full w-full flex-col rounded-2xl border bg-card/60 p-5', className)}
      style={{ minHeight }}
    >
      {hasHeader && (
        <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
            {title && <h3 className="truncate font-heading text-sm font-semibold text-foreground">{title}</h3>}
            {tag}
          </div>
          {action}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
