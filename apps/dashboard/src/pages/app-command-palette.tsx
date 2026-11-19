// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// Composition root — mounts the command palette with providers from other feature slices.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import type { Seed } from "@beechcms/core"
import { CommandPalette } from "@/features/command-palette"
import { SEED_INTENT_NEW, SEED_INTENT_PARAM } from "@/features/seed-builder"
import { useSystemHealth } from "@/features/dashboard"
import { useDashboardLanguage, useSettingsDialog } from "@/features/settings"
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
  const { data: healthData, isError: healthIsError } = useSystemHealth({
    enabled: paletteOpen && canGlobally("view_analytics"),
  })
  const health = React.useMemo(() => ({ data: healthData, isError: healthIsError }), [healthData, healthIsError])

  // The engine closes the palette after a run, so this only navigates.
  const openBuilder = React.useCallback(
    (intent: string) => navigate(`/schema?${SEED_INTENT_PARAM}=${encodeURIComponent(intent)}`),
    [navigate],
  )
  const canManageSeeds = canGlobally("manage_seeds")

  // Alt+Shift+N: the same destination as the "New content type" row, for callers who may manage seeds.
  const onNewSeed = React.useMemo(
    () => (canManageSeeds ? () => openBuilder(SEED_INTENT_NEW) : undefined),
    [canManageSeeds, openBuilder],
  )

  const hostProviders = React.useMemo(() => {
    return [
      createContentTypesProvider({ t, seeds, openBuilder }),
      createSettingsProvider({ t, openSettings }),
      createPreferencesProvider({ t, language, setLanguage, openSettings }),
      createSystemStatusProvider({ t, health }),
    ]
  }, [t, openSettings, seeds, openBuilder, language, setLanguage, health])

  return <CommandPalette hostProviders={hostProviders} onOpenChange={setPaletteOpen} onNewSeed={onNewSeed} />
}
