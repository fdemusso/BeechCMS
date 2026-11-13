// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { Moon, Sun } from "@/components/icons"
import type { PaletteProvider } from "../types"

/** The theme toggle. */
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
    getItems: () => [
      {
        id: "tools:theme",
        section,
        label: t("commandPalette.changeTheme"),
        icon: theme === "dark" ? Sun : Moon,
        keywords: ["dark mode", "light mode", "tema", "theme"],
        perform: { kind: "run", run: toggleTheme },
      },
    ],
  }
}
