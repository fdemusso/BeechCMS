// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useTranslation } from "react-i18next"
import { AppShell, PageBody, PageHeader } from "@/features/navigation"

export function CreateNewPage() {
  const { t } = useTranslation()

  return (
    <AppShell>
      <PageBody>
        <PageHeader className="mb-6" title={t("sidebar.createNew")} description="Create new contents and entries." />

        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg border-muted-foreground/30 bg-card p-6 text-center">
          <div className="max-w-md space-y-2">
            <h3 className="font-heading text-xl font-bold tracking-tight">Create New Content</h3>
            <p className="text-sm text-muted-foreground">
              This page will allow quick entry creation for various schemas and seeds in your workspace.
            </p>
          </div>
        </div>
      </PageBody>
    </AppShell>
  )
}
