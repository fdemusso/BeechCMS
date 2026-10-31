// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import type { DashboardLayout } from "@beechcms/core"
import { Category as LayoutDashboard } from "@/components/icons"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardSection } from "./dashboard-section"

export interface DashboardLayoutRendererProps {
  layout: DashboardLayout
}

const PAGE_PARAM = "page"

/** Pages → Sections → Columns → Widgets. A single page renders without a
 *  tab strip; multiple pages are selected via `?page=<slug>` (replace, not
 *  push). An invalid, absent or hidden slug falls back to the first served
 *  page, which is the first page the caller may see; the URL is not rewritten.
 *  A layout with no pages renders the empty state. */
export function DashboardLayoutRenderer({ layout }: DashboardLayoutRendererProps) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSlug = searchParams.get(PAGE_PARAM)
  const activePage = layout.pages.find((page) => page.slug === requestedSlug) ?? layout.pages[0]

  const handlePageChange = (slug: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(PAGE_PARAM, slug)
        return next
      },
      { replace: true },
    )
  }

  if (!activePage) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
          <LayoutDashboard className="size-6 text-muted-foreground" />
        </div>
        <h3 className="font-heading text-sm font-medium mb-1">{t("dashboard.empty.title")}</h3>
        <p className="text-xs text-muted-foreground max-w-64">{t("dashboard.empty.description")}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {layout.pages.length > 1 && (
        <Tabs value={activePage.slug} onValueChange={handlePageChange}>
          <TabsList variant="line">
            {layout.pages.map((page) => (
              <TabsTrigger key={page.id} value={page.slug}>
                {page.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="flex flex-col gap-6">
        {activePage.sections.map((section) => (
          <DashboardSection key={section.id} section={section} />
        ))}
      </div>
    </div>
  )
}
