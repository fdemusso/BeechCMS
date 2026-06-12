// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useSearchParams } from "react-router-dom"
import type { DashboardLayout } from "@beechcms/core"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardSection } from "./dashboard-section"

export interface DashboardLayoutRendererProps {
  layout: DashboardLayout
}

const PAGE_PARAM = "page"

/** Pages → Sections → Columns → Widgets. A single page renders without a
 *  tab strip; multiple pages are selected via `?page=<slug>` (replace, not
 *  push). An invalid or absent slug falls back to the first page. */
export function DashboardLayoutRenderer({ layout }: DashboardLayoutRendererProps) {
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
