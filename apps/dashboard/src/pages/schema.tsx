// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Navigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { AppShell, PageBody, PageHeader } from "@/features/navigation"
import { SeedBuilderPage } from "@/features/seed-builder"
import { usePermissions } from "@/features/shared"

/** The developer's workspace: the content types they design and package for the people who will use the CMS. */
export function SchemaPage() {
  const { t } = useTranslation()
  const { canGlobally, isLoading } = usePermissions()

  // Hiding is cosmetic (the API gates /api/seeds), but a caller without the authority has nothing to do here.
  if (!isLoading && !canGlobally("manage_seeds")) return <Navigate to="/" replace />

  return (
    <AppShell>
      <PageBody>
        <PageHeader className="mb-6" title={t("seedBuilder.page.navTitle")} description={t("seedBuilder.page.subtitle")} />
        <SeedBuilderPage showSubtitle={false} />
      </PageBody>
    </AppShell>
  )
}
