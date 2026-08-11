// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import {
  User,
  Palette,
  Shield,
  HardDrive,
  Bell,
  Settings,
  Layers,
  X as XIcon,
} from "reicon-react"

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import { ProfileTab } from "./profile-tab"
import { InterfaceTab } from "./interface-tab"
import { SecurityTab } from "./security-tab"
import { StorageTab } from "./storage-tab"
import { NotificationsTab } from "./notifications-tab"
import { GeneralTab } from "./general-tab"
import { SeedBuilderPage } from "@/features/seed-builder"
import type { SettingsTab } from "../types/settings.types"

/** Props for the modal settings dialog component */
export interface SettingsDialogProps {
  /** Controls whether the settings dialog is open */
  readonly open: boolean
  /** Callback fired when the user requests closing the dialog */
  readonly onClose: () => void
  /** Currently active tab identifier */
  readonly activeTab: SettingsTab
  /** Callback fired when a tab selection changes */
  readonly onTabChange: (tab: SettingsTab) => void
}

/** Group of related settings navigation items */
interface SettingsGroup {
  readonly id: string
  readonly title: string
  readonly items: ReadonlyArray<{
    readonly id: SettingsTab
    readonly label: string
    readonly icon: typeof User
  }>
}

/**
 * Renders the active settings tab content.
 * Delegates to specialized feature components per settings category.
 */
function TabContent({ tab }: { readonly tab: SettingsTab }) {
  switch (tab) {
    case "profile":
      return <ProfileTab />
    case "interface":
      return <InterfaceTab />
    case "security":
      return <SecurityTab />
    case "storage":
      return <StorageTab />
    case "notifications":
      return <NotificationsTab />
    case "general":
      return <GeneralTab />
    case "content-types":
      return <SeedBuilderPage />
    default:
      return <ProfileTab />
  }
}

/**
 * Modal dialog for overall application settings.
 * Displays a categorised sidebar on the left and tabbed configuration forms on the right.
 */
export function SettingsDialog({
  open,
  onClose,
  activeTab,
  onTabChange,
}: Readonly<SettingsDialogProps>) {
  const { t } = useTranslation()

  const groups: ReadonlyArray<SettingsGroup> = [
    {
      id: "account",
      title: t("settings.groups.account", "Account"),
      items: [
        { id: "profile", label: t("settings.tabs.profile", "Profile"), icon: User },
        { id: "security", label: t("settings.tabs.security", "Security"), icon: Shield },
        { id: "notifications", label: t("settings.tabs.notifications", "Notifications"), icon: Bell },
      ],
    },
    {
      id: "system",
      title: t("settings.groups.system", "System & UI"),
      items: [
        { id: "general", label: t("settings.tabs.general", "Site"), icon: Settings },
        { id: "interface", label: t("settings.tabs.interface", "Interface"), icon: Palette },
        { id: "storage", label: t("settings.tabs.storage", "Storage"), icon: HardDrive },
      ],
    },
    {
      id: "models",
      title: t("settings.groups.models", "Data Models"),
      items: [
        { id: "content-types", label: t("seedBuilder.page.navTitle", "Content Types"), icon: Layers },
      ],
    },
  ]

  const activeItem = groups.flatMap((g) => g.items).find((item) => item.id === activeTab)
  const ActiveIcon = activeItem?.icon ?? Settings

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

            {/* Category Groups and Tab Buttons */}
            <ScrollArea className="flex-1 min-h-0">
              <nav className="space-y-5 px-3 py-3" aria-label="Settings categories">
                {groups.map((group) => (
                  <div key={group.id} className="space-y-1">
                    <h3 className="px-2 text-[11px] font-medium tracking-wider uppercase text-muted-foreground/80">
                      {group.title}
                    </h3>
                    <div className="space-y-0.5 mt-1">
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const isActive = activeTab === item.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onTabChange(item.id)}
                            className={cn(
                              "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors text-left",
                              isActive
                                ? "bg-accent text-accent-foreground shadow-xs font-semibold"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            )}
                          >
                            <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground/70")} />
                            <span className="truncate">{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </ScrollArea>
          </aside>

          {/* Right Panel Main Active Tab Container */}
          <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
            {/* Active Tab Header */}
            <header className="px-6 py-4 border-b border-border/50 flex items-center justify-between shrink-0 bg-background/50">
              <div className="flex items-center gap-2.5">
                <ActiveIcon className="size-4 text-muted-foreground shrink-0" />
                <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                  {activeItem?.label}
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
                <TabContent tab={activeTab} />
              </div>
            </ScrollArea>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}
