// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import {
  useSettingsDialog,
  getVisibleSettingsEntries,
  SETTINGS_GROUP_LABELS,
  SETTINGS_GROUP_ORDER,
} from "@/features/settings"
import { usePermissions } from "@/features/shared"

interface SettingsItemsProps {
  setOpen: (open: boolean) => void
}

/** One palette row per settings tab the caller may open, grouped like the dialog sidebar. */
export function SettingsItems({ setOpen }: SettingsItemsProps) {
  const { t } = useTranslation()
  const { openSettings } = useSettingsDialog()
  const { canGlobally, canAnywhere } = usePermissions()
  const entries = getVisibleSettingsEntries({ canGlobally, canAnywhere })

  return (
    <>
      {SETTINGS_GROUP_ORDER.map((groupId) => {
        const items = entries.filter((entry) => entry.groupId === groupId)
        if (items.length === 0) return null
        const group = SETTINGS_GROUP_LABELS[groupId]
        return (
          <CommandGroup key={groupId} heading={`${t("commandPalette.settings")} · ${t(group.key, group.defaultLabel)}`}>
            {items.map((entry) => {
              const Icon = entry.icon
              const label = t(entry.labelKey, entry.defaultLabel)
              return (
                <CommandItem
                  key={entry.id}
                  value={`settings ${label}`}
                  keywords={[...entry.keywords, entry.id, t("commandPalette.settings")]}
                  onSelect={() => { openSettings(entry.id); setOpen(false) }}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span>{label}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )
      })}
    </>
  )
}

/** The "Settings…" sub-page. */
export function SettingsView({ setOpen }: SettingsItemsProps) {
  return <SettingsItems setOpen={setOpen} />
}
