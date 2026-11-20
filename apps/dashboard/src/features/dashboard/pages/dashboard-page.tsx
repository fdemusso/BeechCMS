// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Settings } from '@/components/icons'
import { Button } from "@/components/ui/button"
import { AppShell, PageBody, PageHeader } from "@/features/navigation"
import { isDashboardLayoutEditor } from "@beechcms/core"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { useAuth } from "@/lib/auth-context"
import { useElementWidth } from "@/hooks/use-element-width"
import { useDashboardLayout } from "../hooks/use-dashboard-layout"
import { DashboardLayoutRenderer } from "../renderer/dashboard-layout-renderer"
import { DashboardBuilderDialog } from "../builder/dashboard-builder-dialog"
import { listDashboardDraftScopes } from "../builder/dashboard-draft-storage"

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
    <>
      <AppShell>
        {/* Title block and padding come from PageHeader / PageBody, shared with every page: they line the greeting up
            with the sidebar profile card (the measures are in index.css, used by AppSidebar's header). */}
        <PageBody innerRef={contentRef} innerClassName="flex flex-col gap-6">
          <PageHeader
            title={<>{greeting}, <span className="font-medium">{userName}</span></>}
            description={t("dashboard.greeting.subtitle")}
            actions={
              canEdit && (
                <Button type="button" variant="outline" size="sm" onClick={() => { setRecovering(false); setBuilderOpen(true) }}>
                  <Settings className="size-4 mr-2" />
                  {t("dashboard.builder.customize")}
                </Button>
              )
            }
          />

          {!isLoading && <DashboardLayoutRenderer layout={layout} />}
        </PageBody>
      </AppShell>
      {canEdit && (
        <DashboardBuilderDialog
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          initialLayout={layout}
          referenceWidth={contentWidth}
          recovering={recovering}
        />
      )}
    </>
  )
}
