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

export function getStaticMenu(t: (key: string) => string): NavItem[] {
  return [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard,
      isActive: true,
    },
    {
      title: t("sidebar.analytics"),
      url: "/analytics",
      icon: BarChart2,
    },
  ]
}

export function getContentCategoryMenu(t: (key: string) => string): NavItem[] {
  return [
    {
      title: t("sidebar.createNew"),
      url: "/content/create-new",
      icon: Plus,
    },
    {
      title: t("sidebar.drafts"),
      url: "/drafts",
      icon: PenLine,
    },
    {
      title: t("sidebar.scheduled"),
      url: "/scheduled",
      icon: Calendar,
    },
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
