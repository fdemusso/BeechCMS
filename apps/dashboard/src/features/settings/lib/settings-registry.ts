// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Permission } from "@beechcms/core"
import {
  User,
  Palette,
  Shield,
  HardDrive,
  Bell,
  Settings,
  Layers,
  Key,
  Users,
  ShieldCheck,
  Mailbox as Mail,
} from "@/components/icons"
import type { SettingsTab } from "../types/settings.types"

/** The permission answers the registry needs; `usePermissions()` satisfies it structurally. */
export interface SettingsGates {
  canGlobally: (permission: Permission) => boolean
  canAnywhere: (permission: Permission) => boolean
}

export type SettingsGroupId = "account" | "system" | "access" | "models"

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

export const SETTINGS_GROUP_ORDER: readonly SettingsGroupId[] = ["account", "system", "access", "models"]

export const SETTINGS_GROUP_LABELS: Record<SettingsGroupId, { key: string; defaultLabel: string }> = {
  account: { key: "settings.groups.account", defaultLabel: "Account" },
  system: { key: "settings.groups.system", defaultLabel: "System & UI" },
  access: { key: "settings.groups.access", defaultLabel: "Access" },
  models: { key: "settings.groups.models", defaultLabel: "Data Models" },
}

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
    id: "connected-apps", groupId: "account", labelKey: "settings.tabs.connectedApps", defaultLabel: "Connected apps", icon: Key,
    keywords: ["app collegate", "oauth", "mcp", "token", "authorized"],
    isVisible: () => true,
  },
  {
    id: "notifications", groupId: "account", labelKey: "settings.tabs.notifications", defaultLabel: "Notifications", icon: Bell,
    keywords: ["notifiche", "alerts", "email"],
    isVisible: () => true,
  },
  {
    id: "general", groupId: "system", labelKey: "settings.tabs.general", defaultLabel: "Site", icon: Settings,
    keywords: ["sito", "lingua", "language", "timezone", "fuso orario", "locales", "lingue contenuti"],
    isVisible: (g) => g.canGlobally("manage_users"),
  },
  {
    id: "interface", groupId: "system", labelKey: "settings.tabs.interface", defaultLabel: "Interface", icon: Palette,
    keywords: ["interfaccia", "tema", "theme", "lingua dashboard", "language"],
    isVisible: () => true,
  },
  {
    id: "storage", groupId: "system", labelKey: "settings.tabs.storage", defaultLabel: "Storage", icon: HardDrive,
    keywords: ["spazio", "r2", "media", "quota", "usage"],
    isVisible: (g) => g.canGlobally("view_analytics"),
  },
  {
    id: "users", groupId: "access", labelKey: "settings.tabs.users", defaultLabel: "Users", icon: Users,
    keywords: ["utenti", "team", "membri", "members"],
    isVisible: (g) => g.canAnywhere("manage_users"),
  },
  {
    id: "roles", groupId: "access", labelKey: "settings.tabs.roles", defaultLabel: "Roles", icon: ShieldCheck,
    keywords: ["ruoli", "permessi", "permissions", "rbac"],
    isVisible: (g) => g.canAnywhere("manage_users") || g.canAnywhere("manage_roles"),
  },
  {
    id: "invitations", groupId: "access", labelKey: "settings.tabs.invitations", defaultLabel: "Invitations", icon: Mail,
    keywords: ["inviti", "invita", "invite", "nuovo utente"],
    isVisible: (g) => g.canAnywhere("manage_users"),
  },
  {
    id: "content-types", groupId: "models", labelKey: "seedBuilder.page.navTitle", defaultLabel: "Content Types", icon: Layers,
    keywords: ["seed", "schema", "modello", "model", "tipi di contenuto", "builder", "campi", "fields"],
    isVisible: (g) => g.canGlobally("manage_seeds"),
  },
]

/** Entries the caller may see, in sidebar order. */
export function getVisibleSettingsEntries(gates: SettingsGates): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter((entry) => entry.isVisible(gates))
}
