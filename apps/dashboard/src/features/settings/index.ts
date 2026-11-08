// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export { SettingsDialog } from './components/settings-dialog'
export { SettingsDialogHost } from './components/settings-dialog-host'
export { SettingsRedirect } from './components/settings-redirect'
export { getVisibleSettingsEntries, getVisibleSections, matchSettings, resolveSettingsTab, SETTINGS_GROUP_LABELS, SETTINGS_GROUP_ORDER } from './lib/settings-registry'
export type { SettingsEntry } from './lib/settings-registry'
export { useSettingsDialog } from './hooks/use-settings-dialog'
export { useProfile, useGeneralSettings, useUpdateGeneralSettings } from './hooks/use-settings'
export { SETTINGS_QUERY_KEYS } from './hooks/use-settings'

