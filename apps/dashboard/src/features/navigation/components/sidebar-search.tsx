// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Search } from "@/components/icons"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

// The global CommandPalette owns its open state and listens for Cmd/Ctrl+K on `document`.
// Re-dispatching that key combo opens it without coupling this slice to the command-palette slice.
function openCommandPalette() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: IS_MAC, bubbles: true }))
}

/** Sidebar search field: looks like an input, opens the global command palette. */
export function SidebarSearch() {
  const { t } = useTranslation()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label={t("commandPalette.ariaLabel")}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-border pl-3 pr-[7px] text-left text-sm text-muted-foreground outline-hidden transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate">{t("sidebar.search")}</span>
          {/* Concentric with the bar (rounded-lg = 16px, same border as the profile card): the h-5 chips sit 8px from
              the outer edge (1px border + 7px: (36 - 2 - 20) / 2 vertically, pr-[7px] on the right), so their radius is 16 - 8. */}
          <KbdGroup>
            {IS_MAC ? <Kbd className="rounded-[8px]">⌘</Kbd> : <Kbd className="rounded-[8px]">Ctrl</Kbd>}
            <Kbd className="rounded-[8px]">K</Kbd>
          </KbdGroup>
        </button>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
