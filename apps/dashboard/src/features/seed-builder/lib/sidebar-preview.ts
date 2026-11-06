// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"

/** Sidebar position of a seed with no `dashboard.order`; mirrors `buildContentMenu`. */
export const DEFAULT_SIDEBAR_ORDER = 99

export interface SidebarPreviewItem {
  slug: string | null
  title: string
  icon?: string
  /** Tooltip of the entry in the sidebar. */
  description?: string
  order: number
  /** The seed being edited in the dialog. */
  current: boolean
}

export interface SidebarPreview {
  /** The entries around the current one. */
  items: SidebarPreviewItem[]
  /** Entries of the group left out above and below the window. */
  before: number
  after: number
}

/** How many neighbours of the current entry the preview shows on each side. */
export const PREVIEW_RADIUS = 2

/** The sidebar groups already in use, in the order the sidebar shows them (first seed that names one first). */
export function existingGroups(seeds: readonly Seed[]): string[] {
  // A Set keeps insertion order, which is the order the sidebar shows the groups in.
  const groups = new Set<string>()
  for (const seed of seeds) {
    const group = seed.dashboard?.group
    if (group) groups.add(group)
  }
  return [...groups]
}

/**
 * The entries of one sidebar group once the seed in the dialog is in it, sorted the way `buildContentMenu` sorts
 * them (ascending order, ties keep their place), cut to the `radius` entries on each side of the seed in the dialog.
 * The seed in the dialog goes last among equals: a new seed is appended to the list, and a stored one cannot be
 * told apart from the others without its position.
 */
export function sidebarGroupPreview(
  others: readonly Seed[],
  current: { slug: string | null; title: string; icon?: string; description?: string; order?: number },
  group: string,
  radius = PREVIEW_RADIUS
): SidebarPreview {
  const items: SidebarPreviewItem[] = others
    .filter((seed) => seed.slug !== current.slug && !seed.dashboard?.hidden && (seed.dashboard?.group ?? "") === group)
    .map((seed) => ({
      slug: seed.slug,
      title: seed.labelPlural ?? seed.label,
      icon: seed.dashboard?.icon,
      description: seed.dashboard?.description,
      order: seed.dashboard?.order ?? DEFAULT_SIDEBAR_ORDER,
      current: false,
    }))

  items.push({
    slug: current.slug,
    title: current.title,
    icon: current.icon,
    description: current.description,
    order: current.order ?? DEFAULT_SIDEBAR_ORDER,
    current: true,
  })

  items.sort((a, b) => a.order - b.order)
  const index = items.findIndex((item) => item.current)
  const from = Math.max(0, index - radius)
  const to = Math.min(items.length, index + radius + 1)
  return { items: items.slice(from, to), before: from, after: items.length - to }
}
