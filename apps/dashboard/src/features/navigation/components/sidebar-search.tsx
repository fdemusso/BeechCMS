// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Search } from "@/components/icons"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import { IS_MAC, MOD_KEY_LABEL } from "@/lib/platform"


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
          data-rail-item
          aria-label={t("commandPalette.ariaLabel")}
          className="flex h-9 w-full items-center gap-2 overflow-hidden rounded-lg border border-border bg-background pl-[calc(var(--sb-pad-start)-1px)] pr-[7px] text-left text-sm text-muted-foreground outline-hidden transition-[width,height,padding,background-color,border-color] duration-(--duration-enter) hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:pr-0"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate transition-opacity duration-(--duration-enter) group-data-[collapsible=icon]:opacity-0">{t("sidebar.search")}</span>
          {/* Concentric with the bar (rounded-lg = 16px, same border as the profile card): the h-5 chips sit 8px from
              the outer edge (1px border + 7px: (36 - 2 - 20) / 2 vertically, pr-[7px] on the right), so their radius is 16 - 8.
              Soft global tokens (bg-sidebar-accent): visible against the bar on both themes without the heavy contrast of bg-foreground / bg-primary. */}
          <KbdGroup className="transition-opacity duration-(--duration-enter) group-data-[collapsible=icon]:opacity-0">
            <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">{MOD_KEY_LABEL}</Kbd>
            <Kbd className="bg-sidebar-accent text-sidebar-accent-foreground">K</Kbd>
          </KbdGroup>
        </button>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
