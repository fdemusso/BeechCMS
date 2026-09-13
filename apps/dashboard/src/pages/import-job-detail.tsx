// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "reicon-react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { ImportJobPanel } from "@/features/content-transfer"

export function ImportJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-clip">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-w-0">
              <div className="content-area-inner space-y-4">
                <div className="mb-2 flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                    <ArrowLeft className="size-4" />
                    {t("common.back")}
                  </Button>
                </div>
                <h1 className="font-heading text-2xl font-semibold">{t("transfer.job.pageTitle")}</h1>
                {jobId && <ImportJobPanel jobId={jobId} />}
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
