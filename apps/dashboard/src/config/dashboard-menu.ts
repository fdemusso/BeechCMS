import type { IconComponent } from '@/lib/icon-registry'
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Category as LayoutDashboard, Settings, PenLine, Plus, Calendar, ChartBar as BarChart2 } from 'reicon-react'
import type { Seed } from "@beechcms/core"
import { resolveIcon } from "@/lib/icon-registry"

/** Single navigation entry */
export interface NavItem {
  title: string
  url: string
  icon: IconComponent
  isActive?: boolean
  items?: { title: string; url: string }[]
  /** Rendered greyed and unclickable instead of hidden: the caller can see the surface
   *  this belongs to, but may not perform the action. Section-level absence is HIDDEN
   *  instead — the two are never mixed. */
  disabled?: boolean
  /** Tooltip shown on a disabled item; must name the missing authority. */
  disabledReason?: string
}

/**
 * Permission answers the sidebar needs, resolved once by `AppSidebar` from
 * `usePermissions()`. The builders stay pure and testable: they receive answers,
 * never the evaluator.
 *
 * Each flag mirrors a `PROTECTED_ROUTES` row and hides nothing the server allows:
 *  - `viewAnalytics`  → perm('view_analytics','global')  (`/api/content/stats/*`)
 *  - `readContent`    → content:read on at least one seed (`GET /api/content/drafts`,
 *                       whose in-handler projection returns [] for a caller with none)
 *  - `createContent`  → content:create on at least one seed (`POST /api/content/:slug`)
 */
export interface MenuGates {
  viewAnalytics: boolean
  readContent: boolean
  createContent: boolean
}

/** Secondary navigation entry */
export interface NavSecondaryItem {
  title: string
  url: string
  icon: IconComponent
}

/** Grouped block of nav items — maps to one NavMain section in the sidebar */
export interface NavGroup {
  label: string
  items: NavItem[]
}

export function getStaticMenu(t: (key: string) => string, gates: MenuGates): NavItem[] {
  const items: NavItem[] = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, isActive: true },
  ]
  // Analytics owns a dedicated permission → axis one: hidden, not disabled.
  if (gates.viewAnalytics) {
    items.push({ title: t("sidebar.analytics"), url: "/analytics", icon: BarChart2 })
  }
  return items
}

export function getContentCategoryMenu(t: (key: string) => string, gates: MenuGates): NavItem[] {
  // Axis one: no readable seed anywhere ⇒ the whole content axis is absent for this
  // account (zero-trust, brief §2). Nothing to disable, because nothing is visible.
  if (!gates.readContent) return []

  return [
    {
      title: t("sidebar.createNew"),
      url: "/content/create-new",
      icon: Plus,
      // Axis two: the caller sees content, so the feature is shown to exist and is
      // greyed rather than removed (the demo/read-only persona, brief §3).
      disabled: !gates.createContent,
      disabledReason: gates.createContent ? undefined : t("sidebar.disabled.createContent"),
    },
    { title: t("sidebar.drafts"), url: "/drafts", icon: PenLine },
    { title: t("sidebar.scheduled"), url: "/scheduled", icon: Calendar },
  ]
}

export function getSettingsMenu(t: (key: string) => string): NavItem[] {
  return [
    {
      title: t("settings.title"),
      url: "/settings",
      icon: Settings,
    },
  ]
}

/**
 * Builds grouped content menu from seeds.
 * Seeds with no `dashboard.group` fall into the default group.
 * Within each group, seeds are sorted by `dashboard.order` (lower = first).
 */
export function buildContentMenu(seeds: Seed[], defaultGroupLabel: string): NavGroup[] {
  const visible = seeds.filter(s => !s.dashboard?.hidden)

  const byGroup = new Map<string, Seed[]>()
  for (const seed of visible) {
    const group = seed.dashboard?.group ?? defaultGroupLabel
    const existing = byGroup.get(group) ?? []
    existing.push(seed)
    byGroup.set(group, existing)
  }

  return Array.from(byGroup.entries()).map(([label, groupSeeds]) => ({
    label,
    items: groupSeeds
      .sort((a, b) => (a.dashboard?.order ?? 99) - (b.dashboard?.order ?? 99))
      .map(seed => ({
        title: seed.labelPlural ?? seed.label,
        url: `/content/${seed.slug}`,
        icon: resolveIcon(seed.dashboard?.icon),
      })),
  }))
}

export const STATIC_NAV_SECONDARY: NavSecondaryItem[] = []
