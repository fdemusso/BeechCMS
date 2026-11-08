// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Permission } from "@beechcms/core"
import {
  User,
  Palette,
  Shield,
  HardDrive,
  Settings,
  Key,
  Users,
} from "@/components/icons"
import type { SettingsTab } from "../types/settings.types"

/** The permission answers the registry needs; `usePermissions()` satisfies it structurally. */
export interface SettingsGates {
  canGlobally: (permission: Permission) => boolean
  canAnywhere: (permission: Permission) => boolean
}

export type SettingsGroupId = "account" | "system"

export interface SettingsEntry {
  readonly id: SettingsTab
  readonly groupId: SettingsGroupId
  readonly labelKey: string
  readonly defaultLabel: string
  readonly icon: typeof User
  /** Extra palette search terms (IT + EN), beyond the label. */
  readonly keywords: readonly string[]
  /** Mirrors the route gate of what the tab calls; hiding is cosmetic, the server enforces. */
  readonly isVisible: (gates: SettingsGates) => boolean
}

export const SETTINGS_GROUP_ORDER: readonly SettingsGroupId[] = ["account", "system"]

export const SETTINGS_GROUP_LABELS: Record<SettingsGroupId, { key: string; defaultLabel: string }> = {
  account: { key: "settings.groups.account", defaultLabel: "Account" },
  system: { key: "settings.groups.system", defaultLabel: "Workspace" },
}

/** The sections of the Team tab, each with the gate of the API it calls. */
export const TEAM_SECTIONS = [
  { id: "users", labelKey: "settings.tabs.users", defaultLabel: "Users", isVisible: (g: SettingsGates) => g.canAnywhere("manage_users") },
  { id: "roles", labelKey: "settings.tabs.roles", defaultLabel: "Roles", isVisible: (g: SettingsGates) => g.canAnywhere("manage_users") || g.canAnywhere("manage_roles") },
  { id: "invitations", labelKey: "settings.tabs.invitations", defaultLabel: "Invitations", isVisible: (g: SettingsGates) => g.canAnywhere("manage_users") },
] as const

export type TeamSectionId = (typeof TEAM_SECTIONS)[number]["id"]

/**
 * Single source of truth for every settings tab: the dialog sidebar and the command palette both read it,
 * so a new tab is added (and gated) in one place.
 */
export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  {
    id: "profile", groupId: "account", labelKey: "settings.tabs.profile", defaultLabel: "Profile", icon: User,
    keywords: ["profilo", "account", "avatar", "nome", "name"],
    isVisible: () => true,
  },
  {
    id: "security", groupId: "account", labelKey: "settings.tabs.security", defaultLabel: "Security", icon: Shield,
    keywords: ["sicurezza", "password", "sessioni", "sessions", "activity", "attività"],
    isVisible: () => true,
  },
  {
    id: "preferences", groupId: "account", labelKey: "settings.tabs.preferences", defaultLabel: "Preferences", icon: Palette,
    keywords: ["preferenze", "interfaccia", "interface", "tema", "theme", "lingua", "language", "notifiche", "notifications", "alerts"],
    isVisible: () => true,
  },
  {
    id: "connected-apps", groupId: "account", labelKey: "settings.tabs.connectedApps", defaultLabel: "Connected apps", icon: Key,
    keywords: ["app collegate", "oauth", "mcp", "token", "authorized"],
    isVisible: () => true,
  },
  {
    id: "general", groupId: "system", labelKey: "settings.tabs.general", defaultLabel: "Site", icon: Settings,
    keywords: ["sito", "lingua", "language", "timezone", "fuso orario", "locales", "lingue contenuti"],
    isVisible: (g) => g.canGlobally("manage_users"),
  },
  {
    id: "team", groupId: "system", labelKey: "settings.tabs.team", defaultLabel: "Team", icon: Users,
    keywords: ["utenti", "users", "ruoli", "roles", "permessi", "permissions", "rbac", "inviti", "invitations", "invita", "invite", "membri", "members"],
    isVisible: (g) => TEAM_SECTIONS.some((section) => section.isVisible(g)),
  },
  {
    id: "storage", groupId: "system", labelKey: "settings.tabs.storage", defaultLabel: "Storage", icon: HardDrive,
    keywords: ["spazio", "r2", "media", "quota", "usage"],
    isVisible: (g) => g.canGlobally("view_analytics"),
  },
]

/** Tabs that were merged into another: old links (`?settings=roles`, `/settings?tab=interface`) keep working. */
const LEGACY_TABS: Readonly<Record<string, SettingsTab>> = {
  interface: "preferences",
  notifications: "preferences",
  users: "team",
  roles: "team",
  invitations: "team",
}

/** Maps a raw `?settings=` value to a tab id, following the merges above; unknown values pass through. */
export function resolveSettingsTab(raw: string): SettingsTab {
  return (LEGACY_TABS[raw] ?? raw) as SettingsTab
}

/** Entries the caller may see, in sidebar order. */
export function getVisibleSettingsEntries(gates: SettingsGates): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter((entry) => entry.isVisible(gates))
}
