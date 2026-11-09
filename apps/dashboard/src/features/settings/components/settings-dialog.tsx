// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useRef, useState } from "react"
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
import { sectionDomId } from "@/components/ui/settings-section-ids"

import { AccountTab } from "./account-tab"
import { AppearanceTab } from "./appearance-tab"
import { LanguageTab } from "./language-tab"
import { StorageTab } from "./storage-tab"
import { NotificationsTab } from "./notifications-tab"
import { SiteTab } from "./site-tab"
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
 * Each page is a stack of sections, one per bookmark the sidebar lists for it (see `SETTINGS_ENTRIES`).
 */
function TabContent({ tab }: { readonly tab: SettingsTab }) {
  switch (tab) {
    case "notifications":
      return <NotificationsTab />
    case "connected-apps":
      return <ConnectedAppsTab />
    case "appearance":
      return <AppearanceTab />
    case "language":
      return <LanguageTab />
    case "site":
      return <SiteTab />
    case "people":
      return <PeopleTab />
    case "storage":
      return <StorageTab />
    default:
      return <AccountTab />
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

  const navRef = useRef<HTMLElement>(null)
  const hasShownRef = useRef(false)

  // A bookmark scrolls its section into view (the page body is the scroll container): from a sidebar click, a link
  // or the command palette alike. Picking one is a jump, so after the first render the focus follows to the section's
  // heading and a screen reader starts reading there; opening the dialog on a bookmark only scrolls.
  useEffect(() => {
    const isFirstRun = !hasShownRef.current
    hasShownRef.current = true
    if (!activeSection) return
    const target = document.getElementById(sectionDomId(activeSection))
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    target?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" })
    if (!isFirstRun) target?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true })
  }, [safeTab, activeSection])

  // Said aloud whenever the page changes, since the focus stays on the sidebar entry that was pressed.
  const pageTitle = activeEntry ? t(activeEntry.labelKey, activeEntry.defaultLabel) : ""
  const activeSectionEntry = activeEntry?.sections.find((section) => section.id === activeSection)
  const pageAnnouncement = activeSectionEntry ? `${pageTitle}, ${t(activeSectionEntry.labelKey, activeSectionEntry.defaultLabel)}` : pageTitle

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
        // A plain fade, 220ms in and 20% quicker (176ms) out, for the dialog and for the backdrop behind it: the zoom the
        // dialog normally carries is cancelled, so only the opacity moves.
        className="flex flex-col sm:max-w-3xl md:max-w-5xl lg:max-w-6xl h-[85vh] max-h-[calc(100vh-3rem)] p-0 gap-0 overflow-hidden border-border/80 bg-background shadow-2xl transition-opacity data-open:zoom-in-100 data-open:duration-(--duration-enter) data-closed:zoom-out-100 data-closed:duration-(--duration-exit)"
        overlayClassName="transition-opacity data-open:duration-(--duration-enter) data-closed:duration-(--duration-exit)"
        // The focus starts on the entry of the page that is open: the keyboard begins where the sidebar says you are.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus()
        }}
        // Escape clears a search first and only then closes the dialog.
        onEscapeKeyDown={(e) => { if (query) { e.preventDefault(); setQuery("") } }}
      >
        <DialogTitle className="sr-only">{t("settings.title", "Settings")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("settings.description", "Manage your account, your preferences and the workspace.")}
        </DialogDescription>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left column: where to go. Its only landmarks are the search and the navigation. */}
          <div className="w-56 sm:w-64 border-r border-border/60 bg-sidebar flex flex-col shrink-0 select-none">
            {/* Same fixed height as the page header beside it, so the divider runs straight across. The dialog title
                above already names the dialog: this one is for the eyes only. */}
            <div aria-hidden className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border/50 px-4 sm:px-5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
                <Settings className="size-4" />
              </div>
              <span className="font-heading text-sm font-bold tracking-tight text-foreground">
                {t("settings.title", "Settings")}
              </span>
            </div>

            {/* Search: narrows the list below to what matches, bookmarks included */}
            <search className="block px-3 pt-3">
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  name="settings-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("settings.search", "Search settings…")}
                  aria-label={t("settings.search", "Search settings…")}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-sm text-foreground outline-hidden placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("settings.clearSearch", "Clear search")}
                    className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <XIcon aria-hidden className="size-3.5" />
                  </button>
                )}
              </div>
              {/* How many tabs match, said as the search narrows; silent when there is no search. */}
              <p role="status" className="sr-only">
                {searching ? t("settings.resultsCount", { count: matches.length, defaultValue: "{{count}} settings found" }) : ""}
              </p>
            </search>

            {/* Families, their tabs and the bookmarks of the open tab */}
            <ScrollArea className="flex-1 min-h-0">
              <nav ref={navRef} className="px-3 py-3" aria-label={t("settings.navLabel", "Settings categories")}>
                {groups.length === 0 && (
                  <p className="px-2.5 py-4 text-sm text-sidebar-foreground/70">{t("settings.noResults", "No settings found")}</p>
                )}
                <div className="space-y-3">
                  {groups.map((group) => {
                    const groupLabelId = `settings-group-${group.id}`
                    return (
                      <div key={group.id}>
                        {/* A named list, not a heading: the page has one outline, and this is a label for a set of links. */}
                        <p id={groupLabelId} className="flex h-8 items-center px-2.5 text-xs font-medium text-sidebar-foreground/70">
                          {group.title}
                        </p>
                        <ul aria-labelledby={groupLabelId} className="space-y-0.5">
                          {group.items.map(({ entry: item, sections }) => {
                            const Icon = item.icon
                            const isActive = safeTab === item.id
                            const isUnfolded = searching || expanded.has(item.id)
                            const subnavId = `settings-subnav-${item.id}`
                            const itemLabel = t(item.labelKey, item.defaultLabel)
                            return (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => handleEntryClick(item)}
                                  aria-current={isActive ? "page" : undefined}
                                  aria-expanded={sections.length > 0 ? isUnfolded : undefined}
                                  aria-controls={sections.length > 0 ? subnavId : undefined}
                                  className={cn(
                                    "flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                    isActive && "bg-sidebar-active font-medium text-sidebar-accent-foreground"
                                  )}
                                >
                                  <Icon aria-hidden className="size-4 shrink-0" />
                                  <span className="truncate">{itemLabel}</span>
                                </button>
                                {sections.length > 0 && (
                                  // Kept mounted so it can fold: the row height eases between 0fr and 1fr, 220ms to unfold
                                  // and 20% quicker (176ms) to fold. `inert` takes the folded links out of the tab order
                                  // and out of the accessibility tree.
                                  <div
                                    id={subnavId}
                                    inert={!isUnfolded}
                                    className={cn(
                                      "grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none",
                                      isUnfolded ? "grid-rows-[1fr] opacity-100 duration-(--duration-enter)" : "grid-rows-[0fr] opacity-0 duration-(--duration-exit)"
                                    )}
                                  >
                                    <div className="ml-[1.15rem] min-h-0 overflow-hidden">
                                      <ul aria-label={itemLabel} className="space-y-0.5 border-l border-sidebar-border py-1 pl-2">
                                        {sections.map((sectionItem) => {
                                          const isCurrent = isActive && activeSection === sectionItem.id
                                          return (
                                            <li key={sectionItem.id}>
                                              <button
                                                type="button"
                                                onClick={() => onTabChange(item.id, sectionItem.id)}
                                                aria-current={isCurrent ? "location" : undefined}
                                                className={cn(
                                                  "flex h-7 w-full items-center rounded-control px-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </nav>
            </ScrollArea>

            {/* Last entry of the list, apart from the families */}
            <div className="border-t border-sidebar-border p-3">
              <button
                type="button"
                onClick={() => { void logout() }}
                className="flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-left text-sm text-status-danger-foreground transition-colors hover:bg-destructive/10"
              >
                <LogOut aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{t("settings.logout", "Log out")}</span>
              </button>
            </div>
          </div>

          {/* The page of the open tab. A section, not <main>: the app behind the dialog already has its main landmark.
              Light: --background already sits above --sidebar. Dark: it sits below, so the page is the sidebar colour plus a touch of white. */}
          <section
            aria-labelledby="settings-page-title"
            className="flex-1 flex flex-col min-w-0 [--settings-page-bg:var(--background)] dark:[--settings-page-bg:color-mix(in_oklch,var(--sidebar),white_6%)] bg-[var(--settings-page-bg)] overflow-hidden"
          >
            <div className="px-6 h-16 border-b border-border/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <ActiveIcon aria-hidden className="size-4 text-muted-foreground shrink-0" />
                <h2 id="settings-page-title" className="font-heading text-base font-bold tracking-tight text-foreground">
                  {pageTitle}
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
                <XIcon aria-hidden className="size-4" />
              </Button>
            </div>

            {/* Heard, not seen: the page changed under a focus that did not move. */}
            <p role="status" className="sr-only">{pageAnnouncement}</p>

            <ScrollArea className="flex-1 min-h-0">
              <div className="max-w-4xl mx-auto p-6 md:p-8">
                <TabContent tab={safeTab} />
              </div>
            </ScrollArea>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
