// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useSearchParams, useNavigate } from "react-router-dom"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { SettingsDialog } from "../components/settings-dialog"
import type { SettingsTab } from "../types/settings.types"

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeTab = (searchParams.get("tab") as SettingsTab) ?? "profile"

  const handleTabChange = (newTab: SettingsTab) => {
    setSearchParams({ tab: newTab }, { replace: true })
  }

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate("/")
    }
  }

  return (
    <div className="[--header-height:calc(--spacing(14))] min-h-screen bg-background/50 dark:bg-background/50">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0 flex flex-1 items-center justify-center" />
        </div>
      </SidebarProvider>
      <SettingsDialog
        open={true}
        onClose={handleClose}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </div>
  )
}
