// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Settings } from '@/components/icons'
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { SiteHeader } from "@/features/navigation"
import { isDashboardLayoutEditor } from "@beechcms/core"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { useAuth } from "@/lib/auth-context"
import { useElementWidth } from "@/hooks/use-element-width"
import { useDashboardLayout } from "../hooks/use-dashboard-layout"
import { DashboardSidebar } from "../components/sidebar/dashboard-sidebar"
import { DashboardLayoutRenderer } from "../renderer/dashboard-layout-renderer"
import { DashboardBuilderDialog } from "../builder/dashboard-builder-dialog"
import { listDashboardDraftScopes } from "../builder/dashboard-draft-storage"

// TODO(sidebar-redesign): flip back (or delete with SiteHeader) once toggle/notifications are re-homed.
const SHOW_SITE_HEADER = false

export default function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { layout, isLoading } = useDashboardLayout()
  const [builderOpen, setBuilderOpen] = useState(false)
  const { effective } = usePermissions()
  // Mirrors the PUT gate (manage_layout or manage_roles at *); the server enforces.
  const canEdit = isDashboardLayoutEditor(effective)
  // The builder sizes itself from the dashboard's content width, so its ghosts have the shape of the real cards.
  const { ref: contentRef, width: contentWidth } = useElementWidth<HTMLDivElement>()

  // Unsaved builder work survives a reload: when one is waiting, the builder comes back without asking.
  // A reload never closes the builder on purpose, so a draft at load time means the work was cut short.
  const recoveryChecked = useRef(false)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    if (!canEdit || recoveryChecked.current) return
    recoveryChecked.current = true
    if (listDashboardDraftScopes().length === 0) return
    setRecovering(true)
    setBuilderOpen(true)
  }, [canEdit])
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
    <div className="relative">
      {/* TODO(sidebar-redesign): the decorative blurred blobs and the translucent page background were
          removed so the page floor is one flat `--sidebar` colour. Decide whether the blobs return
          inside the inset card. */}
      <SidebarProvider className="h-svh overflow-hidden">
        {/* TODO(sidebar-redesign): SiteHeader is hidden, not deleted. Its jobs still need a new home:
            sidebar toggle (also the only way to open the sidebar on mobile), NotificationsPopover,
            breadcrumbs. */}
        {SHOW_SITE_HEADER && <SiteHeader />}
        <DashboardSidebar />
        {/* "body-dashboard": the inset card. It scrolls internally via ScrollArea; md:m-2 on the inset variant eats 1rem of height. */}
        {/* TODO(sidebar-redesign): card border/contrast is still the default `shadow-sm`; tune the edge
            (ring/border + --background vs --sidebar tokens, scoped to the dashboard). */}
        <SidebarInset className="h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)]">
          <ScrollArea className="h-full">
            {/* Vertical alignment with the sidebar logo row (md+, where the sidebar is docked):
                the logo is centred on this greeting block (h1 36px pinned by leading-9! + gap 6 + subtitle 24 = 66px),
                which starts at 8 (card m-2) + 14 (pt-3.5) = 22px, so its centre is 55px.
                DashboardSidebar's header pt-[23px] puts the logo centre there. Keep both files in sync. */}
            <main className="flex flex-1 flex-col gap-8 p-6 md:p-8 md:pt-3.5 lg:p-10 lg:pt-3.5">
              {/* Contenitore interno: limita la larghezza massima a 2200px
                  per una lettura ottimale sia su 16:9 che su 21:9. */}
              <div ref={contentRef} className="content-area-inner flex flex-col gap-8">
                {/* Welcome Header */}
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col gap-1.5">
                    <h1 className="font-heading text-2xl font-bold leading-9! tracking-tight md:text-3xl text-foreground">
                      {greeting}, <span className="font-semibold">{userName}</span>
                    </h1>
                    <p className="text-muted-foreground">
                      {t("dashboard.greeting.subtitle")}
                    </p>
                  </div>
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setRecovering(false); setBuilderOpen(true) }}>
                      <Settings className="size-4 mr-2" />
                      {t("dashboard.builder.customize")}
                    </Button>
                  )}
                </div>

                {!isLoading && <DashboardLayoutRenderer layout={layout} />}
              </div>
            </main>
          </ScrollArea>
        </SidebarInset>
      </SidebarProvider>
      {canEdit && (
        <DashboardBuilderDialog
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          initialLayout={layout}
          referenceWidth={contentWidth}
          recovering={recovering}
        />
      )}
    </div>
  )
}
