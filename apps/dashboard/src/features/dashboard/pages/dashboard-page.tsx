// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Settings } from 'reicon-react'
import { canEditDashboard } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { useAuth } from "@/lib/auth-context"
import { useDashboardLayout } from "../hooks/use-dashboard-layout"
import { DashboardLayoutRenderer } from "../renderer/dashboard-layout-renderer"
import { DashboardBuilderDialog } from "../builder/dashboard-builder-dialog"

export default function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { layout } = useDashboardLayout()
  const [builderOpen, setBuilderOpen] = useState(false)
  const canEdit = canEditDashboard(user?.role)
  const hour = new Date().getHours()
  const greeting = hour >= 5 && hour < 12
    ? t("dashboard.greeting.morning")
    : hour >= 12 && hour < 18
      ? t("dashboard.greeting.afternoon")
      : hour >= 18 && hour < 22
        ? t("dashboard.greeting.evening")
        : t("dashboard.greeting.night")
  const userName = user?.name || "Admin"

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-clip min-h-screen bg-background/50 dark:bg-background/50 relative">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>

      <SidebarProvider className="flex flex-col relative z-10">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <main className="flex flex-1 flex-col gap-8 p-6 md:p-8 lg:p-10">
              {/* Contenitore interno: limita la larghezza massima a 2200px
                  per una lettura ottimale sia su 16:9 che su 21:9. */}
              <div className="content-area-inner flex flex-col gap-8">
                {/* Welcome Header */}
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col gap-1.5">
                    <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl text-foreground">
                      {greeting}, <span className="font-semibold">{userName}</span>
                    </h1>
                    <p className="text-muted-foreground">
                      {t("dashboard.greeting.subtitle")}
                    </p>
                  </div>
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setBuilderOpen(true)}>
                      <Settings className="size-4 mr-2" />
                      {t("dashboard.builder.customize")}
                    </Button>
                  )}
                </div>

                <DashboardLayoutRenderer layout={layout} />
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
      {canEdit && (
        <DashboardBuilderDialog open={builderOpen} onOpenChange={setBuilderOpen} initialLayout={layout} />
      )}
    </div>
  )
}
