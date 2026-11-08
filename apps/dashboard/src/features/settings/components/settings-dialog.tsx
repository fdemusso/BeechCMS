// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Settings, Logout as LogOut, X as XIcon } from "@/components/icons"

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
  getVisibleSections,
  getVisibleSettingsEntries,
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
 * A sidebar of families on the left (a tab with bookmarks unfolds them while it is open, "Log out" closes the list),
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
  const groups = SETTINGS_GROUP_ORDER.map((id) => ({
    id,
    title: t(SETTINGS_GROUP_LABELS[id].key, SETTINGS_GROUP_LABELS[id].defaultLabel),
    items: visibleEntries.filter((entry) => entry.groupId === id),
  })).filter((group) => group.items.length > 0)

  const visibleTabs = new Set(visibleEntries.map((entry) => entry.id))
  const safeTab: SettingsTab = visibleTabs.has(activeTab) ? activeTab : "account"

  const activeEntry: SettingsEntry | undefined = visibleEntries.find((entry) => entry.id === safeTab)
  const ActiveIcon = activeEntry?.icon ?? Settings

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col sm:max-w-3xl md:max-w-5xl lg:max-w-6xl h-[85vh] max-h-[calc(100vh-3rem)] p-0 gap-0 overflow-hidden border-border/80 bg-background shadow-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{t("settings.title", "Settings")}</DialogTitle>
        <DialogDescription className="sr-only">{t("settings.title", "Settings")}</DialogDescription>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Categorised Left Navigation Sidebar */}
          <aside className="w-56 sm:w-64 border-r border-border/60 bg-muted/30 dark:bg-muted/15 flex flex-col shrink-0 select-none">
            {/* Sidebar Header */}
            <div className="p-4 sm:p-5 flex items-center gap-2.5 border-b border-border/40">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Settings className="size-4" />
              </div>
              <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
                {t("settings.title", "Settings")}
              </span>
            </div>

            {/* Families, their tabs and the bookmarks of the open tab */}
            <ScrollArea className="flex-1 min-h-0">
              <nav className="space-y-5 px-3 py-3" aria-label={t("settings.navLabel", "Settings categories")}>
                {groups.map((group) => (
                  <div key={group.id} className="space-y-1">
                    <h3 className="px-2 text-[11px] font-medium tracking-wider uppercase text-muted-foreground/80">
                      {group.title}
                    </h3>
                    <div className="space-y-0.5 mt-1">
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const isActive = safeTab === item.id
                        const sections = isActive ? getVisibleSections(item, gates) : []
                        return (
                          <div key={item.id}>
                            <button
                              type="button"
                              onClick={() => onTabChange(item.id)}
                              aria-current={isActive ? "page" : undefined}
                              aria-expanded={item.sections.length > 0 ? isActive : undefined}
                              className={cn(
                                "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors text-left",
                                isActive
                                  ? "bg-accent text-accent-foreground shadow-xs font-semibold"
                                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                              )}
                            >
                              <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground/70")} />
                              <span className="truncate">{t(item.labelKey, item.defaultLabel)}</span>
                            </button>
                            {sections.length > 0 && (
                              <ul className="ml-[1.15rem] mt-0.5 mb-1 space-y-0.5 border-l border-border/60 pl-2">
                                {sections.map((sectionItem) => {
                                  const isCurrent = activeSection === sectionItem.id
                                  return (
                                    <li key={sectionItem.id}>
                                      <button
                                        type="button"
                                        onClick={() => onTabChange(item.id, sectionItem.id)}
                                        aria-current={isCurrent ? "location" : undefined}
                                        className={cn(
                                          "w-full truncate rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                                          isCurrent
                                            ? "bg-accent/70 font-medium text-foreground"
                                            : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                                        )}
                                      >
                                        {t(sectionItem.labelKey, sectionItem.defaultLabel)}
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
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
            <div className="border-t border-border/40 p-3">
              <button
                type="button"
                onClick={() => { void logout() }}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-destructive transition-colors text-left hover:bg-destructive/10"
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
