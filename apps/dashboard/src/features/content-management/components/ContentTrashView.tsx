// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table"
import type { Seed } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import { RelativeTime } from "@/components/ui/relative-time"
import { SmallCta } from "@/components/ui/small-cta"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { retentionRemainingDays } from "../lib/retention"

export interface ContentTrashViewProps {
  seed: Seed
  data: ContentEntry[]
  /** Unix seconds, resolved once per render by the page — keeps this component pure w.r.t. time. */
  nowSeconds: number
  rowSelection: RowSelectionState
  onRowSelectionChange: (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void
  selectedIds: string[]
  pageIndex: number
  onPageIndexChange: (index: number) => void
  pageSize: number
  pageCount: number
  totalRows: number
  canRestore: boolean
  canPurge: boolean
  isMutating: boolean
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onBulkRestore: (ids: string[]) => void
  onBulkPurge: (ids: string[]) => void
}

export function ContentTrashView(props: Readonly<ContentTrashViewProps>) {
  const {
    seed,
    data,
    nowSeconds,
    rowSelection,
    onRowSelectionChange,
    selectedIds,
    pageIndex,
    onPageIndexChange,
    pageSize,
    pageCount,
    totalRows,
    canRestore,
    canPurge,
    isMutating,
    onRestore,
    onPurge,
    onBulkRestore,
    onBulkPurge,
  } = props
  const { t } = useTranslation()

  const columns = React.useMemo<ColumnDef<ContentEntry>[]>(
    () => [
      {
        id: "display",
        header: seed.label,
        accessorFn: (row) => String(row.data[seed.displayNameAlias ?? "title"] ?? row.id),
        cell: ({ getValue }) => <span className="truncate">{getValue<string>()}</span>,
      },
      {
        id: "slug",
        header: t("content.table.slug", { defaultValue: "Slug" }),
        accessorFn: (row) => row.slug,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{getValue<string | null>() ?? "—"}</span>
        ),
      },
      {
        id: "deleted_at",
        header: t("content.trash.deletedAt"),
        cell: ({ row }) => <RelativeTime value={row.original.deleted_at ?? null} />,
      },
      {
        id: "retention",
        header: t("content.trash.retention"),
        cell: ({ row }) => {
          const days = retentionRemainingDays(row.original.deleted_at, seed.retentionDays, nowSeconds)
          return days == null ? <span className="text-muted-foreground">—</span> : t("content.trash.daysLeft", { count: days })
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canRestore || isMutating}
              onClick={() => onRestore(row.original.id)}
            >
              {t("content.trash.restore")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!canPurge || isMutating}
              onClick={() => onPurge(row.original.id)}
            >
              {t("content.trash.purge")}
            </Button>
          </div>
        ),
      },
    ],
    [seed, t, nowSeconds, canRestore, canPurge, isMutating, onRestore, onPurge]
  )

  return (
    <div className="flex flex-1 flex-col gap-3 min-h-0">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm">{t("content.trash.selectedCount", { count: selectedIds.length })}</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canRestore || isMutating}
              onClick={() => onBulkRestore(selectedIds)}
            >
              {t("content.trash.restore")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!canPurge || isMutating}
              onClick={() => onBulkPurge(selectedIds)}
            >
              {t("content.trash.purge")}
            </Button>
          </div>
        </div>
      )}
      <DataTable
        columns={columns}
        data={data}
        rowSelection={rowSelection}
        onRowSelectionChange={onRowSelectionChange}
        pageSize={pageSize}
        pageIndex={pageIndex}
        onPageIndexChange={onPageIndexChange}
        pageCount={pageCount}
        totalRows={totalRows}
        manualPagination
        emptyState={
          <SmallCta svgPath={`${import.meta.env.BASE_URL}noResult.svg`} title={t("content.trash.empty")} />
        }
      />
    </div>
  )
}
