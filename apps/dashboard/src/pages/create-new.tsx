// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useTranslation } from "react-i18next"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"

export function CreateNewPage() {
  const { t } = useTranslation()

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-clip">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-w-0">
              <div className="content-area-inner">
                <div className="mb-6">
                  <h1 className="text-2xl font-semibold">{t("sidebar.createNew")}</h1>
                  <p className="text-muted-foreground text-sm">Create new contents and entries.</p>
                </div>
                
                <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg border-muted-foreground/30 bg-card p-6 text-center">
                  <div className="max-w-md space-y-2">
                    <h3 className="text-lg font-semibold tracking-tight">Create New Content</h3>
                    <p className="text-sm text-muted-foreground">
                      This page will allow quick entry creation for various schemas and seeds in your workspace.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
