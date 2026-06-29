// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Table } from "lucide-react"
import { resolvePolicies } from "@beechcms/core"
import { DashboardWidgetShell } from "../dashboard-widget-shell"
import { useWidgetList } from "../../hooks/use-widget-data"
import { useActiveSeed } from "@/features/shared"
import { generateColumns, type ContentEntry } from "@/lib/dynamic-columns"
import { DataTable } from "@/components/ui/data-table"
import { Skeleton } from "@/components/ui/skeleton"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

const MAX_PAGE_SIZE = 25
const DEFAULT_PAGE_SIZE = 5
const RESERVED_KEYS = new Set(["id", "slug", "status", "createdAt", "updatedAt"])

export interface DataTableWidgetConfig {
  seedSlug: string
  columns?: string[]
  pageSize?: number
  orderByColumn?: string
  orderDirection?: "ASC" | "DESC"
}

export function DataTableWidget({ config, title }: { config: DataTableWidgetConfig; title?: string }) {
  const { t } = useTranslation()
  const widgetTitle = title || t("dashboard.widgetRegistry.widgets.dataTable.label")
  const navigate = useNavigate()
  const { seed, isLoading: seedLoading } = useActiveSeed(config.seedSlug)
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = Math.min(config.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

  const { data, isLoading, isError, refetch } = useWidgetList(config.seedSlug, {
    limit: pageSize,
    offset: pageIndex * pageSize,
    orderByColumn: config.orderByColumn,
    orderDirection: config.orderDirection,
  })

  const visibleAliases = useMemo(() => {
    if (!seed) return []
    return seed.branches.filter((branch) => resolvePolicies(branch).visibility === "full").map((branch) => branch.alias)
  }, [seed])

  const selectedAliases = useMemo(() => {
    const requested = config.columns?.length ? config.columns : visibleAliases.slice(0, 4)
    return requested.filter((alias) => visibleAliases.includes(alias))
  }, [config.columns, visibleAliases])

  const columns = useMemo(() => {
    if (!seed) return []
    const allColumns = generateColumns(seed, () => {}, () => {})
    const order = new Map(selectedAliases.map((alias, index) => [alias, index]))
    return allColumns
      .filter((column) => column.id !== undefined && order.has(column.id))
      .sort((a, b) => order.get(a.id as string)! - order.get(b.id as string)!)
  }, [seed, selectedAliases])

  const entries: ContentEntry[] = useMemo(() => {
    return (data?.entries ?? []).map((entry) => {
      const entryData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(entry)) {
        if (!RESERVED_KEYS.has(key)) entryData[key] = value
      }
      return {
        id: entry.id,
        schema_slug: config.seedSlug,
        slug: entry.slug,
        status: entry.status,
        data: entryData,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      }
    })
  }, [data, config.seedSlug])

  if (isLoading || seedLoading) {
    return (
      <DashboardWidgetShell title={widgetTitle} icon={Table}>
        <Skeleton className="h-full w-full rounded-lg" />
      </DashboardWidgetShell>
    )
  }

  if (isError) {
    return (
      <DashboardWidgetShell title={widgetTitle} icon={Table}>
        <WidgetError onRetry={() => refetch()} />
      </DashboardWidgetShell>
    )
  }

  if (entries.length === 0) {
    return (
      <DashboardWidgetShell title={widgetTitle} icon={Table}>
        <WidgetEmpty icon={Table} title={t("dashboard.widgets.dataTable.empty.title")} description={t("dashboard.widgets.dataTable.empty.description")} />
      </DashboardWidgetShell>
    )
  }

  const total = data?.total ?? entries.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <DashboardWidgetShell title={widgetTitle} icon={Table} contentClassName="overflow-hidden">
      <DataTable
        columns={columns}
        data={entries}
        manualPagination
        pageSize={pageSize}
        pageIndex={pageIndex}
        onPageIndexChange={setPageIndex}
        pageCount={pageCount}
        totalRows={total}
        onRowDoubleClick={(row) => navigate(`/content/${config.seedSlug}/${row.id}`)}
      />
    </DashboardWidgetShell>
  )
}
