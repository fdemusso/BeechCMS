// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Search, Settings, Logout as LogOut, X as XIcon } from "@/components/icons"

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { logout } from "@/lib/api"

import { ProfileTab } from "./profile-tab"
import { InterfaceTab } from "./interface-tab"
import { SecurityTab } from "./security-tab"
import { StorageTab } from "./storage-tab"
import { NotificationsTab } from "./notifications-tab"
import { GeneralTab } from "./general-tab"
import { PeopleTab } from "./people-tab"
import { ConnectedAppsTab } from "@/features/oauth-consent"
import { usePermissions } from "@/features/shared"
import type { SettingsTab } from "../types/settings.types"
import {
  SETTINGS_GROUP_LABELS,
  SETTINGS_GROUP_ORDER,
  getVisibleSettingsEntries,
  matchSettings,
  type SettingsEntry,
} from "../lib/settings-registry"

/** Props for the modal settings dialog component */
export interface SettingsDialogProps {
  /** Controls whether the settings dialog is open */
  readonly open: boolean
  /** Callback fired when the user requests closing the dialog */
  readonly onClose: () => void
  /** Currently active tab identifier */
  readonly activeTab: SettingsTab
  /** The bookmark inside the active tab the user jumped to, if any. */
  readonly activeSection?: string | null
  /** Callback fired when a tab (or one of its bookmarks) is picked */
  readonly onTabChange: (tab: SettingsTab, section?: string) => void
}

/**
 * Renders the active settings tab content.
 * Delegates to specialized feature components per settings category.
 *
 * The pages are still the earlier tab bodies; they get split along the bookmarks the sidebar lists
 * (see `SETTINGS_ENTRIES`) as each tab is redesigned. Until then Appearance and Language share one body.
 */
function TabContent({ tab }: { readonly tab: SettingsTab }) {
  switch (tab) {
    case "notifications":
      return <NotificationsTab />
    case "connected-apps":
      return <ConnectedAppsTab />
    case "appearance":
    case "language":
      return <InterfaceTab />
    case "site":
      return <GeneralTab />
    case "people":
      return <PeopleTab />
    case "storage":
      return <StorageTab />
    default:
      return (
        <div className="space-y-6">
          <ProfileTab />
          <SecurityTab />
        </div>
      )
  }
}

/**
 * Modal dialog for overall application settings.
 * A sidebar of families on the left (a tab with bookmarks unfolds them until its own entry is clicked again, "Log out" closes the list),
 * the page of the active tab on the right.
 */
export function SettingsDialog({
  open,
  onClose,
  activeTab,
  activeSection,
  onTabChange,
}: Readonly<SettingsDialogProps>) {
  const { t } = useTranslation()
  const { canGlobally, canAnywhere } = usePermissions()
  const gates = { canGlobally, canAnywhere }

  const visibleEntries = getVisibleSettingsEntries(gates)
  const [query, setQuery] = useState("")
  const searching = query.trim() !== ""
  const matches = matchSettings(gates, query, (key, defaultLabel) => t(key, defaultLabel))
  const groups = SETTINGS_GROUP_ORDER.map((id) => ({
    id,
    title: t(SETTINGS_GROUP_LABELS[id].key, SETTINGS_GROUP_LABELS[id].defaultLabel),
    items: matches.filter((match) => match.entry.groupId === id),
  })).filter((group) => group.items.length > 0)

  const visibleTabs = new Set(visibleEntries.map((entry) => entry.id))
  const safeTab: SettingsTab = visibleTabs.has(activeTab) ? activeTab : "account"

  const activeEntry: SettingsEntry | undefined = visibleEntries.find((entry) => entry.id === safeTab)
  const ActiveIcon = activeEntry?.icon ?? Settings

  // Bookmarks stay unfolded while other tabs are visited; only the parent entry folds them again. The tab being
  // shown always unfolds when it changes (a link, the command palette), but never refolds on its own.
  const [expanded, setExpanded] = useState<ReadonlySet<SettingsTab>>(() => new Set([safeTab]))
  const [seenTab, setSeenTab] = useState(safeTab)
  if (seenTab !== safeTab) {
    setSeenTab(safeTab)
    setExpanded((prev) => new Set(prev).add(safeTab))
  }

  /** Folded: unfold and go there. Unfolded but elsewhere: go there, stay unfolded. Unfolded and shown: fold. */
  function handleEntryClick(entry: SettingsEntry) {
    // While searching every hit is already unfolded: a click only goes there.
    if (searching || entry.sections.length === 0) {
      onTabChange(entry.id)
      return
    }
    const isUnfolded = expanded.has(entry.id)
    if (isUnfolded && safeTab === entry.id) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
      return
    }
    setExpanded((prev) => new Set(prev).add(entry.id))
    if (safeTab !== entry.id) onTabChange(entry.id)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col sm:max-w-3xl md:max-w-5xl lg:max-w-6xl h-[85vh] max-h-[calc(100vh-3rem)] p-0 gap-0 overflow-hidden border-border/80 bg-background shadow-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Escape clears a search first and only then closes the dialog.
        onEscapeKeyDown={(e) => { if (query) { e.preventDefault(); setQuery("") } }}
      >
        <DialogTitle className="sr-only">{t("settings.title", "Settings")}</DialogTitle>
        <DialogDescription className="sr-only">{t("settings.title", "Settings")}</DialogDescription>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Categorised Left Navigation Sidebar */}
          <aside className="w-56 sm:w-64 border-r border-border/60 bg-sidebar flex flex-col shrink-0 select-none">
            {/* Sidebar Header */}
            <div className="p-4 sm:p-5 flex items-center gap-2.5 border-b border-border/40">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Settings className="size-4" />
              </div>
              <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
                {t("settings.title", "Settings")}
              </span>
            </div>

            {/* Search: narrows the families below to what matches, bookmarks included */}
            <div className="px-3 pt-3">
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  role="searchbox"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("settings.search", "Search settings…")}
                  aria-label={t("settings.search", "Search settings…")}
                  className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-sm text-foreground outline-hidden placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("settings.clearSearch", "Clear search")}
                    className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Families, their tabs and the bookmarks of the open tab */}
            <ScrollArea className="flex-1 min-h-0">
              <nav className="space-y-3 px-3 py-3" aria-label={t("settings.navLabel", "Settings categories")}>
                {groups.length === 0 && (
                  <p className="px-2.5 py-4 text-sm text-sidebar-foreground/70">{t("settings.noResults", "No settings found")}</p>
                )}
                {groups.map((group) => (
                  <div key={group.id}>
                    <h3 className="flex h-8 items-center px-2.5 text-xs font-medium text-sidebar-foreground/70">
                      {group.title}
                    </h3>
                    <div className="space-y-0.5">
                      {group.items.map(({ entry: item, sections }) => {
                        const Icon = item.icon
                        const isActive = safeTab === item.id
                        const isUnfolded = searching || expanded.has(item.id)
                        return (
                          <div key={item.id}>
                            <button
                              type="button"
                              onClick={() => handleEntryClick(item)}
                              aria-current={isActive ? "page" : undefined}
                              aria-expanded={sections.length > 0 ? isUnfolded : undefined}
                              className={cn(
                                "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              )}
                            >
                              <Icon className="size-4 shrink-0" />
                              <span className="truncate">{t(item.labelKey, item.defaultLabel)}</span>
                            </button>
                            {sections.length > 0 && (
                              // Kept mounted so it can fold: the row height eases between 0fr and 1fr, 220ms to unfold
                              // and 20% quicker (176ms) to fold. `inert` takes the folded links out of the tab order.
                              <div
                                inert={!isUnfolded}
                                aria-hidden={!isUnfolded}
                                className={cn(
                                  "grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none",
                                  isUnfolded ? "grid-rows-[1fr] opacity-100 duration-[220ms]" : "grid-rows-[0fr] opacity-0 duration-[176ms]"
                                )}
                              >
                                <div className="ml-[1.15rem] min-h-0 overflow-hidden">
                                  <ul className="space-y-0.5 border-l border-sidebar-border py-1 pl-2">
                                    {sections.map((sectionItem) => {
                                      const isCurrent = isActive && activeSection === sectionItem.id
                                      return (
                                        <li key={sectionItem.id}>
                                          <button
                                            type="button"
                                            onClick={() => onTabChange(item.id, sectionItem.id)}
                                            aria-current={isCurrent ? "location" : undefined}
                                            className={cn(
                                              "flex h-7 w-full items-center rounded-md px-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                              isCurrent && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                            )}
                                          >
                                            <span className="truncate">{t(sectionItem.labelKey, sectionItem.defaultLabel)}</span>
                                          </button>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </ScrollArea>

            {/* Last entry of the list, apart from the families */}
            <div className="border-t border-sidebar-border p-3">
              <button
                type="button"
                onClick={() => { void logout() }}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="size-4 shrink-0" />
                <span className="truncate">{t("settings.logout", "Log out")}</span>
              </button>
            </div>
          </aside>

          {/* Right Panel Main Active Tab Container */}
          <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
            {/* Active Tab Header */}
            <header className="px-6 py-4 border-b border-border/50 flex items-center justify-between shrink-0 bg-background/50">
              <div className="flex items-center gap-2.5">
                <ActiveIcon className="size-4 text-muted-foreground shrink-0" />
                <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                  {activeEntry && t(activeEntry.labelKey, activeEntry.defaultLabel)}
                </h2>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="rounded-full"
                aria-label={t("common.close", "Close")}
              >
                <XIcon className="size-4" />
              </Button>
            </header>

            {/* Scrollable Active Tab Form Body */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="max-w-4xl mx-auto p-6 md:p-8">
                <TabContent tab={safeTab} />
              </div>
            </ScrollArea>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}
