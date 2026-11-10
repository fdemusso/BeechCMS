// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { Moon, Search, Sun } from "@/components/icons"
import type { PaletteItem, PaletteProvider } from "../types"

/** Content search (only for callers who can read something) and the theme toggle. */
export function createToolsProvider(deps: {
  t: TFunction
  theme: string | undefined
  toggleTheme: () => void
}): PaletteProvider {
  const { t, theme, toggleTheme } = deps
  const section = t("commandPalette.tools")

  return {
    id: "tools",
    pages: ["root"],
    getItems: ({ permissions }) => {
      const items: PaletteItem[] = []
      if (permissions.canAnywhere("content:read")) {
        items.push({
          id: "tools:search",
          section,
          label: t("commandPalette.searchContent"),
          icon: Search,
          perform: { kind: "page", page: "search-results" },
        })
      }
      items.push({
        id: "tools:theme",
        section,
        label: t("commandPalette.changeTheme"),
        icon: theme === "dark" ? Sun : Moon,
        keywords: ["dark mode", "light mode", "tema", "theme"],
        perform: { kind: "run", run: toggleTheme },
      })
      return items
    },
  }
}
