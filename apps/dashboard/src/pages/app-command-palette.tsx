// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// Composition root — mounts the command palette with providers from other feature slices.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import type { Seed } from "@beechcms/core"
import { CommandPalette } from "@/features/command-palette"
import { SEED_INTENT_PARAM } from "@/features/seed-builder"
import { useSystemHealth } from "@/features/dashboard"
import { useDashboardLanguage, useNotificationPrefToggle, useSettingsDialog } from "@/features/settings"
import { usePermissions, useSchema } from "@/features/shared"
import {
  createContentTypesProvider,
  createPreferencesProvider,
  createSettingsProvider,
  createSystemStatusProvider,
} from "./palette-providers"

const NO_SEEDS: Seed[] = []

/** The app-wide command palette, wired to the settings, dashboard and content type builder slices. */
export function AppCommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { openSettings } = useSettingsDialog()
  const { data: seeds = NO_SEEDS } = useSchema()
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const { canGlobally } = usePermissions()
  const { language, setLanguage } = useDashboardLanguage()
  const notifications = useNotificationPrefToggle({ enabled: paletteOpen })
  const { data: healthData, isError: healthIsError } = useSystemHealth({
    enabled: paletteOpen && canGlobally("view_analytics"),
  })
  const health = React.useMemo(() => ({ data: healthData, isError: healthIsError }), [healthData, healthIsError])

  const hostProviders = React.useMemo(() => {
    // The engine closes the palette after a run, so this only navigates.
    const openBuilder = (intent: string) =>
      navigate(`/schema?${SEED_INTENT_PARAM}=${encodeURIComponent(intent)}`)
    return [
      createContentTypesProvider({ t, seeds, openBuilder }),
      createSettingsProvider({ t, openSettings }),
      createPreferencesProvider({ t, language, setLanguage, notifications }),
      createSystemStatusProvider({ t, health }),
    ]
  }, [t, openSettings, seeds, navigate, language, setLanguage, notifications, health])

  return <CommandPalette hostProviders={hostProviders} onOpenChange={setPaletteOpen} />
}
