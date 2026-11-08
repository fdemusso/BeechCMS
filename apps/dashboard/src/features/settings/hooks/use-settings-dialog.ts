// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import type { SettingsTab } from "../types/settings.types"
import { resolveSettingsTab } from "../lib/settings-registry"

/** Query param that opens the settings dialog over whatever page is current (`?settings=<tab>`). */
export const SETTINGS_PARAM = "settings"
/** Query param naming the bookmark inside the open tab (`?settings=account&section=password`). */
export const SETTINGS_SECTION_PARAM = "section"
const DEFAULT_TAB: SettingsTab = "account"

/**
 * Settings open as an overlay driven by the URL, not as a route: the current page stays mounted (and is blurred by
 * the dialog overlay), other query params are preserved, and the dialog is linkable.
 */
export function useSettingsDialog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get(SETTINGS_PARAM)
  const open = param !== null
  const tab = resolveSettingsTab(param || DEFAULT_TAB)
  const section = searchParams.get(SETTINGS_SECTION_PARAM)

  const openSettings = useCallback(
    (nextTab: SettingsTab = DEFAULT_TAB, extraParams?: Readonly<Record<string, string>>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set(SETTINGS_PARAM, nextTab)
        // Hand-offs the opened tab consumes (e.g. `seed=new` for the content type builder).
        for (const [key, value] of Object.entries(extraParams ?? {})) next.set(key, value)
        return next
      })
    },
    [setSearchParams],
  )

  // Tab changes and closing replace the entry, so Back doesn't walk through every tab the user clicked.
  const setTab = useCallback(
    (nextTab: SettingsTab, nextSection?: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(SETTINGS_PARAM, nextTab)
          if (nextSection) next.set(SETTINGS_SECTION_PARAM, nextSection)
          else next.delete(SETTINGS_SECTION_PARAM)
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
        next.delete(SETTINGS_SECTION_PARAM)
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  return { open, tab, section, openSettings, setTab, closeSettings }
}
