// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import type { SettingsTab } from "../types/settings.types"

/** Query param that opens the settings dialog over whatever page is current (`?settings=<tab>`). */
export const SETTINGS_PARAM = "settings"
const DEFAULT_TAB: SettingsTab = "profile"

/**
 * Settings open as an overlay driven by the URL, not as a route: the current page stays mounted (and is blurred by
 * the dialog overlay), other query params are preserved, and the dialog is linkable.
 */
export function useSettingsDialog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get(SETTINGS_PARAM)
  const open = param !== null
  const tab = (param || DEFAULT_TAB) as SettingsTab

  const openSettings = useCallback(
    (nextTab: SettingsTab = DEFAULT_TAB) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set(SETTINGS_PARAM, nextTab)
        return next
      })
    },
    [setSearchParams],
  )

  // Tab changes and closing replace the entry, so Back doesn't walk through every tab the user clicked.
  const setTab = useCallback(
    (nextTab: SettingsTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(SETTINGS_PARAM, nextTab)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const closeSettings = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(SETTINGS_PARAM)
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  return { open, tab, openSettings, setTab, closeSettings }
}
