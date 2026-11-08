// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Permission } from "@beechcms/core"
import {
  User,
  Palette,
  HardDrive,
  Bell,
  Settings,
  Key,
  Users,
  Language,
} from "@/components/icons"
import type { SettingsTab } from "../types/settings.types"

/** The permission answers the registry needs; `usePermissions()` satisfies it structurally. */
export interface SettingsGates {
  canGlobally: (permission: Permission) => boolean
  canAnywhere: (permission: Permission) => boolean
}

export type SettingsGroupId = "account" | "experience" | "workspace"

/** A bookmark inside a tab's page: listed under the tab in the sidebar while it is open. */
export interface SettingsSection {
  readonly id: string
  readonly labelKey: string
  readonly defaultLabel: string
  /** Defaults to the entry's own gate. */
  readonly isVisible?: (gates: SettingsGates) => boolean
}

export interface SettingsEntry {
  readonly id: SettingsTab
  readonly groupId: SettingsGroupId
  readonly labelKey: string
  readonly defaultLabel: string
  readonly icon: typeof User
  /** Extra palette search terms (IT + EN), beyond the label. */
  readonly keywords: readonly string[]
  readonly sections: readonly SettingsSection[]
  /** Mirrors the route gate of what the tab calls; hiding is cosmetic, the server enforces. */
  readonly isVisible: (gates: SettingsGates) => boolean
}

export const SETTINGS_GROUP_ORDER: readonly SettingsGroupId[] = ["account", "experience", "workspace"]

export const SETTINGS_GROUP_LABELS: Record<SettingsGroupId, { key: string; defaultLabel: string }> = {
  account: { key: "settings.groups.account", defaultLabel: "Account" },
  experience: { key: "settings.groups.experience", defaultLabel: "Experience" },
  workspace: { key: "settings.groups.workspace", defaultLabel: "Workspace" },
}

const section = (id: string, labelKey: string, defaultLabel: string, isVisible?: SettingsSection["isVisible"]): SettingsSection =>
  ({ id, labelKey, defaultLabel, isVisible })

/** The sections of the Users & roles tab, each with the gate of the API it calls. */
export const PEOPLE_SECTIONS = [
  section("users", "settings.sections.users", "Users", (g) => g.canAnywhere("manage_users")),
  section("invitations", "settings.sections.invitations", "Invitations", (g) => g.canAnywhere("manage_users")),
  section("roles", "settings.sections.roles", "Roles", (g) => g.canAnywhere("manage_users") || g.canAnywhere("manage_roles")),
] as const

/**
 * Single source of truth for every settings tab and its bookmarks: the dialog sidebar and the command palette
 * both read it, so a new tab is added (and gated) in one place.
 *
 * Only what a non-developer can configure lives here. The content type builder is the developer's own
 * workspace (`/schema`), not a setting.
 */
export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  {
    id: "account", groupId: "account", labelKey: "settings.tabs.account", defaultLabel: "My account", icon: User,
    keywords: ["profilo", "profile", "account", "avatar", "nome", "name", "email", "password", "sicurezza", "security", "sessioni", "sessions", "attività", "activity"],
    sections: [
      section("profile", "settings.sections.profile", "Profile"),
      section("password", "settings.sections.password", "Password"),
      section("sessions", "settings.sections.sessions", "Active sessions"),
      section("activity", "settings.sections.activity", "Recent activity"),
    ],
    isVisible: () => true,
  },
  {
    id: "notifications", groupId: "account", labelKey: "settings.tabs.notifications", defaultLabel: "Notifications", icon: Bell,
    keywords: ["notifiche", "alerts", "avvisi"],
    sections: [],
    isVisible: () => true,
  },
  {
    id: "connected-apps", groupId: "account", labelKey: "settings.tabs.connectedApps", defaultLabel: "Connected apps", icon: Key,
    keywords: ["app collegate", "oauth", "mcp", "token", "authorized", "integrazioni"],
    sections: [],
    isVisible: () => true,
  },
  {
    id: "appearance", groupId: "experience", labelKey: "settings.tabs.appearance", defaultLabel: "Appearance", icon: Palette,
    keywords: ["aspetto", "tema", "theme", "dark", "scuro", "chiaro", "light", "interfaccia", "interface", "righe", "rows"],
    sections: [
      section("theme", "settings.sections.theme", "Theme"),
      section("lists", "settings.sections.lists", "Lists"),
    ],
    isVisible: () => true,
  },
  {
    id: "language", groupId: "experience", labelKey: "settings.tabs.language", defaultLabel: "Language", icon: Language,
    keywords: ["lingua", "language", "italiano", "english", "dashboard"],
    sections: [],
    isVisible: () => true,
  },
  {
    id: "site", groupId: "workspace", labelKey: "settings.tabs.site", defaultLabel: "Site", icon: Settings,
    keywords: ["sito", "titolo", "azienda", "company", "fuso orario", "timezone", "valuta", "currency", "cestino", "trash", "retention"],
    sections: [
      section("identity", "settings.sections.identity", "Site identity"),
      section("regional", "settings.sections.regional", "Regional defaults"),
      section("trash", "settings.sections.trash", "Trash"),
      section("content-languages", "settings.sections.contentLanguages", "Content languages"),
    ],
    isVisible: (g) => g.canGlobally("manage_users"),
  },
  {
    id: "people", groupId: "workspace", labelKey: "settings.tabs.people", defaultLabel: "Users & roles", icon: Users,
    keywords: ["utenti", "users", "ruoli", "roles", "permessi", "permissions", "rbac", "inviti", "invitations", "invita", "invite", "membri", "team", "members"],
    sections: PEOPLE_SECTIONS,
    isVisible: (g) => PEOPLE_SECTIONS.some((s) => s.isVisible(g)),
  },
  {
    id: "storage", groupId: "workspace", labelKey: "settings.tabs.storage", defaultLabel: "Storage", icon: HardDrive,
    keywords: ["spazio", "archiviazione", "r2", "media", "quota", "usage", "orfani", "orphans"],
    sections: [
      section("usage", "settings.sections.usage", "Usage"),
      section("orphans", "settings.sections.orphans", "Orphan files"),
    ],
    isVisible: (g) => g.canGlobally("view_analytics"),
  },
]

/** Entries the caller may see, in sidebar order. */
export function getVisibleSettingsEntries(gates: SettingsGates): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter((entry) => entry.isVisible(gates))
}

/** The bookmarks of `entry` the caller may see. */
export function getVisibleSections(entry: SettingsEntry, gates: SettingsGates): SettingsSection[] {
  return entry.sections.filter((s) => (s.isVisible ?? (() => true))(gates))
}

export interface SettingsMatch {
  readonly entry: SettingsEntry
  /** The bookmarks worth showing under the entry for this query. */
  readonly sections: SettingsSection[]
}

/** Case- and accent-insensitive: "attivita" finds "Attività recente". */
const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()

/**
 * What the sidebar search shows for `query`: an entry whose own label matches keeps all its bookmarks; otherwise the
 * bookmarks that match; otherwise, if only a keyword matched ("password" for My account), all of them.
 * An empty query returns every entry the caller may see.
 */
export function matchSettings(
  gates: SettingsGates,
  query: string,
  translate: (key: string, defaultLabel: string) => string,
): SettingsMatch[] {
  const needle = fold(query)
  const matches: SettingsMatch[] = []
  for (const entry of getVisibleSettingsEntries(gates)) {
    const sections = getVisibleSections(entry, gates)
    if (!needle) {
      matches.push({ entry, sections })
      continue
    }
    if (fold(translate(entry.labelKey, entry.defaultLabel)).includes(needle)) {
      matches.push({ entry, sections })
      continue
    }
    const hits = sections.filter(
      (s) => fold(translate(s.labelKey, s.defaultLabel)).includes(needle) || s.id.includes(needle),
    )
    if (hits.length > 0) matches.push({ entry, sections: hits })
    else if (entry.keywords.some((keyword) => fold(keyword).includes(needle))) matches.push({ entry, sections })
  }
  return matches
}

/** Tabs that were merged or renamed: old links (`?settings=roles`, `/settings?tab=interface`) keep working. */
const LEGACY_TABS: Readonly<Record<string, SettingsTab>> = {
  profile: "account",
  security: "account",
  interface: "appearance",
  general: "site",
  team: "people",
  users: "people",
  roles: "people",
  invitations: "people",
}

/** Maps a raw `?settings=` value to a tab id, following the renames above; unknown values pass through. */
export function resolveSettingsTab(raw: string): SettingsTab {
  return (LEGACY_TABS[raw] ?? raw) as SettingsTab
}
