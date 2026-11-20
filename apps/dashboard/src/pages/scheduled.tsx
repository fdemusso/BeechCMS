// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useTranslation } from "react-i18next"
import { AppShell, PageBody, PageHeader } from "@/features/navigation"

export function ScheduledPage() {
  const { t } = useTranslation()

  return (
    <AppShell>
      <PageBody>
        <PageHeader className="mb-6" title={t("sidebar.scheduled")} description="Scheduled publication queues." />

        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg border-muted-foreground/30 bg-card p-6 text-center">
          <div className="max-w-md space-y-2">
            <h3 className="font-heading text-xl font-bold tracking-tight">No scheduled contents</h3>
            <p className="text-sm text-muted-foreground">
              This page will display upcoming publications, timed automations, and scheduled releases.
            </p>
          </div>
        </div>
      </PageBody>
    </AppShell>
  )
}
