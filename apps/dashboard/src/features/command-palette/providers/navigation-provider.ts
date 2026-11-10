// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { Settings } from "@/components/icons"
import {
  getContentCategoryMenu,
  getStaticMenu,
  getStudioMenu,
  type MenuGates,
  type NavItem,
} from "@/config/dashboard-menu"
import type { PaletteItem, PaletteProvider } from "../types"

/**
 * Screens the caller may open, taken from the same menu builders as the sidebar so both agree on what exists for a role.
 * Idle, it also offers the "Settings…" page; while typing the settings provider lists the tabs directly.
 */
export function createNavigationProvider(deps: { t: TFunction }): PaletteProvider {
  const { t } = deps
  const translate = (key: string) => t(key)

  return {
    id: "nav",
    pages: ["root"],
    getItems: ({ query, permissions }) => {
      const gates: MenuGates = {
        viewAnalytics: permissions.canGlobally("view_analytics"),
        readContent: permissions.canAnywhere("content:read"),
        createContent: permissions.canAnywhere("content:create"),
        manageSeeds: permissions.canGlobally("manage_seeds"),
      }
      const menuItems: NavItem[] = [
        ...getStaticMenu(translate, gates),
        ...getStudioMenu(translate, gates),
        ...getContentCategoryMenu(translate, gates),
      ]
      const section = t("commandPalette.navigate")

      const items: PaletteItem[] = menuItems
        // NavItem.disabled carries no permission name to show, so such rows are skipped like placeholder pages.
        .filter((item) => !item.notImplemented && !item.disabled)
        .map((item) => ({
          id: `nav:${item.url}`,
          section,
          label: item.title,
          icon: item.icon,
          perform: { kind: "navigate", to: item.url },
        }))

      if (!query) {
        items.push({
          id: "nav:settings",
          section,
          label: t("commandPalette.settingsAll"),
          icon: Settings,
          perform: { kind: "page", page: "settings" },
        })
      }
      return items
    },
  }
}
