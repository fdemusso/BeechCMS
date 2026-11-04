// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useAuth } from "@/lib/auth-context"
import { useSettingsDialog } from "../hooks/use-settings-dialog"
import { SettingsDialog } from "./settings-dialog"

/** Mounted once at the app root: shows the settings dialog whenever the URL carries `?settings=<tab>`. */
export function SettingsDialogHost() {
  const { user } = useAuth()
  const { open, tab, setTab, closeSettings } = useSettingsDialog()

  // The dialog reads authenticated endpoints; never show it on login/setup pages.
  if (!open || !user) return null

  return <SettingsDialog open onClose={closeSettings} activeTab={tab} onTabChange={setTab} />
}
