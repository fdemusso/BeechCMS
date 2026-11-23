// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Icon names the dashboard resolves for `DashboardSeedConfig.icon` and a role `icon`.
 * Single source of truth: the dashboard types its `ICON_MAP` as `Record<DashboardIconName, …>`, so a name
 * added or removed here without the matching component fails type-check, and the validation warning and the
 * bundled agent docs read this same list. A name outside it renders the default `Folder` icon.
 */
export const DASHBOARD_ICON_NAMES = [
  'Folder', 'Newspaper', 'ShoppingBag', 'Users', 'MessageSquare', 'Layout', 'UserCircle', 'Mail',
  'FileText', 'Image', 'Video', 'Music', 'Tag', 'Bookmark', 'Star', 'Heart', 'Globe', 'Link',
  'Calendar', 'Clock', 'Map', 'MapPin', 'Package', 'Box', 'Archive', 'Database', 'Settings',
  'Wrench', 'Code', 'Terminal', 'Book', 'BookOpen', 'GraduationCap', 'Award', 'Trophy', 'Flag',
  'Layers', 'Grid', 'List', 'Table', 'BarChart', 'PieChart', 'TrendingUp', 'Activity', 'Zap',
  'Shield', 'Lock', 'Key', 'Bell', 'Phone', 'Camera', 'Mic', 'Monitor', 'Cpu', 'HardDrive', 'Wifi',
  'Home', 'Building', 'Store', 'Briefcase', 'DollarSign', 'CreditCard', 'ShoppingCart', 'Truck',
  'Percent', 'Hash', 'AtSign', 'Info', 'HelpCircle', 'AlertCircle', 'CheckCircle',
  'Car', 'ClipboardList', 'ClipboardCheck', 'Checklist', 'Warehouse', 'Receipt', 'Wallet', 'User',
  'Gift', 'Rocket', 'LifeBuoy',
] as const

export type DashboardIconName = (typeof DASHBOARD_ICON_NAMES)[number]

/** Icon rendered when a name is missing or not in `DASHBOARD_ICON_NAMES`. */
export const DEFAULT_DASHBOARD_ICON: DashboardIconName = 'Folder'

const ICON_NAME_SET: ReadonlySet<string> = new Set(DASHBOARD_ICON_NAMES)

export function isDashboardIconName(name: string): name is DashboardIconName {
  return ICON_NAME_SET.has(name)
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution)
    }
    previous = current
  }
  return previous[b.length]
}

/**
 * The valid icon names nearest to `name`, best first. Names that contain, or are contained in, the input
 * rank ahead of the rest, which are ordered by edit distance. Case-insensitive.
 */
export function closestDashboardIconNames(name: string, limit = 3): DashboardIconName[] {
  const needle = name.toLowerCase()
  const scored = DASHBOARD_ICON_NAMES.map((candidate) => {
    const hay = candidate.toLowerCase()
    const related = needle.length > 0 && (hay.includes(needle) || needle.includes(hay))
    return { candidate, rank: related ? 0 : 1, distance: editDistance(needle, hay) }
  })
  scored.sort((a, b) => a.rank - b.rank || a.distance - b.distance)
  return scored.slice(0, limit).map((entry) => entry.candidate)
}
