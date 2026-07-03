// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ColumnDef, GroupingColumnDef } from "@tanstack/react-table"
import type { Seed } from "@beechcms/core"
import {
  MoreHorizontal,
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Code,
  FileText,
  File,
  Link as LinkIcon,
} from "lucide-react"
import { toast } from "sonner"

import { FieldDisplay } from "@/components/fields"
import { IndicatorIcon } from "@/components/ui/indicator-icon"
import { RelativeTime } from "@/components/ui/relative-time"
import { getStatusTone, STATUS_TONE_DOT_CLASS } from "@/lib/status-tone"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { matchesFilterGroup } from "@/lib/filter-dsl"
import { pendingDraftBadgeClass, shouldShowPendingDraftBadge } from "@/lib/pending-draft"

import {
  DateGroupPrecision,
  DEFAULT_DATE_GROUP_PRECISION,
  getDateGroupValue,
  booleanAggFn,
  formatBooleanAggregated,
  formatSum,
} from "./dynamic-columns-aggregation"

// Re-export utility functions and types for full compatibility with consumers
export { computeMaxLengths } from "./dynamic-columns-lengths"
export {
  DEFAULT_DATE_GROUP_PRECISION,
  getDateGroupValue,
  booleanAggFn,
  formatBooleanAggregated,
  formatSum,
} from "./dynamic-columns-aggregation"
export type { DateGroupPrecision } from "./dynamic-columns-aggregation"

/**
 * Interface representing a CMS content entry.
 * Corresponds to the entry structure returned by the content management APIs.
 */
export interface ContentEntry {
  /** The unique identifier of the entry. */
  id: string
  /** The schema slug of the seed this entry belongs to. */
  schema_slug: string
  /** URL-friendly slug representing this entry, or null if unassigned. */
  slug: string | null
  /** The publication status (e.g. "draft", "published"). */
  status: string
  /** Flag showing if a newer draft exists that has not been published yet. */
  has_pending_draft?: boolean
  /** Key-value dictionary containing the actual content fields values. */
  data: Record<string, unknown>
  /** Epoch timestamp of when this entry was created. */
  created_at: number | null
  /** Epoch timestamp of when this entry was last updated. */
  updated_at: number | null
}

/**
 * Maps a schema branch type string to its corresponding Lucide icon component.
 *
 * @param type - The branch type string.
 * @returns The LucideIcon React component.
 */
function getIconForType(type: string) {
  switch (type) {
    case "text":
      return Type
    case "number":
      return Hash
    case "boolean":
      return ToggleLeft
    case "date":
      return Calendar
    case "json":
      return Code
    case "richtext":
      return FileText
    case "file":
      return File
    case "relation":
      return LinkIcon
    default:
      return File
  }
}

/**
 * Generates the unified React Table column definitions mapping.
 * Combines system columns (selection checkbox, ID, slug, status, timestamps, actions dropdown)
 * with dynamic data columns representing custom schema fields rendered via {@link FieldDisplay}.
 *
 * @param seed - Schema seed definition.
 * @param onEdit - Callback to edit a selected entry.
 * @param onDelete - Callback to delete a selected entry.
 * @param maxLengths - Map containing truncation options.
 * @param selectedIds - List of currently selected row IDs (for bulk actions).
 * @param onBulkDelete - Callback to trigger bulk delete.
 * @param datePrecision - The active grouping precision rules for dates.
 * @param translate - Localization translation function.
 * @param onBulkEdit - Callback to trigger bulk edit dialog.
 * @returns Column definitions list for TanStack Table.
 */
export function generateColumns(
  seed: Seed,
  onEdit: (id: string) => void,
  onDelete: (id: string) => void,
  maxLengths?: Record<string, number>,
  selectedIds: string[] = [],
  onBulkDelete?: (ids: string[]) => void,
  datePrecision: DateGroupPrecision = DEFAULT_DATE_GROUP_PRECISION,
  translate: (key: string, options?: any) => string = (key) => key,
  onBulkEdit?: (ids: string[]) => void
): ColumnDef<ContentEntry>[] {
  const fixedColumns: ColumnDef<ContentEntry>[] = [
    // Colonna Select (checkbox)
    {
      id: "select",
      enableResizing: false,
      size: 40,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={translate("common.selectAll")}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={translate("common.selectRow")}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },

    // Colonna di sistema: ID
    {
      id: "id",
      size: 160,
      minSize: 80,
      maxSize: 400,
      accessorFn: (row) => row.id,
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs truncate max-w-[8rem] block" title={row.original.id}>
          {row.original.id}
        </span>
      ),
      enableSorting: false,
    },

    // Colonna di sistema: Slug
    {
      id: "slug",
      size: 160,
      minSize: 80,
      maxSize: 400,
      accessorFn: (row) => row.slug,
      header: "Slug",
      filterFn: (row, columnId, filterValue) =>
        matchesFilterGroup(row.getValue(columnId), filterValue),
      cell: ({ row }) => {
        const slug = row.original.slug
        return <span className="text-muted-foreground text-sm">{slug ?? "—"}</span>
      },
      enableSorting: false,
    },

    // Colonna di sistema: Status (indicator dot + label)
    {
      id: "status",
      size: 160,
      minSize: 80,
      maxSize: 400,
      accessorFn: (row) => row.status,
      header: translate("content.table.status"),
      filterFn: (row, columnId, filterValue) =>
        matchesFilterGroup(row.getValue(columnId), filterValue),
      cell: ({ row }) => {
        const status = (row.original.status ?? "").trim() || "—"
        const tone = getStatusTone(status)
        const hasPendingDraft = shouldShowPendingDraftBadge(
          row.original.status,
          row.original.has_pending_draft
        )
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5">
              <IndicatorIcon colorClassName={STATUS_TONE_DOT_CLASS[tone]} aria-label={status} />
              <span className="text-sm">{status}</span>
            </span>
            {hasPendingDraft && (
              <Badge variant="outline" className={`text-xs ${pendingDraftBadgeClass}`}>
                {translate("content.table.pendingDraft")}
              </Badge>
            )}
          </div>
        )
      },
      enableSorting: false,
    },

    // System columns: timestamps
    {
      id: "updated_at",
      size: 160,
      minSize: 80,
      maxSize: 400,
      accessorFn: (row) => row.updated_at,
      header: translate("content.table.updated"),
      cell: ({ row }) => (
        <RelativeTime value={row.original.updated_at} className="text-sm text-muted-foreground" />
      ),
      enableSorting: false,
    },
    {
      id: "created_at",
      size: 160,
      minSize: 80,
      maxSize: 400,
      accessorFn: (row) => row.created_at,
      header: translate("content.table.created"),
      cell: ({ row }) => (
        <RelativeTime value={row.original.created_at} className="text-sm text-muted-foreground" />
      ),
      enableSorting: false,
    },
  ]

  // Colonne dinamiche: solo da seed.branches, cella = solo FieldDisplay
  const dynamicColumns: ColumnDef<ContentEntry>[] = seed.branches.map((branch) => {
    const IconComponent = getIconForType(branch.type)
    const baseColumn: ColumnDef<ContentEntry> & GroupingColumnDef<ContentEntry, unknown> = {
      accessorFn: (row) => row.data[branch.alias],
      id: branch.alias,
      size: 200,
      minSize: 80,
      maxSize: 600,
      header: () => (
        <div className="flex items-center gap-[0.5em] font-medium">
          <IconComponent className="h-[1em] w-[1em] shrink-0 text-muted-foreground" />
          <span>{branch.label}</span>
        </div>
      ),
      filterFn: (row, columnId, filterValue) =>
        matchesFilterGroup(row.getValue(columnId), filterValue),
    }

    // Configurazione grouping/aggregation per tipo
    if (branch.type === "date") {
      baseColumn.getGroupingValue = (row) =>
        getDateGroupValue(row.data[branch.alias], datePrecision)
      baseColumn.aggregationFn = "count"
      baseColumn.aggregatedCell = ({ getValue, row }) => {
        const count = row.subRows?.length ?? 0
        const label = getValue<string>()
        if (!label) return null
        return (
          <span className="text-xs text-muted-foreground">
            {label} · {count}{" "}
            {count === 1 ? translate("content.table.item") : translate("content.table.items")}
          </span>
        )
      }
    } else if (branch.type === "boolean") {
      baseColumn.aggregationFn = booleanAggFn
      baseColumn.aggregatedCell = ({ getValue }) => {
        const formatted = formatBooleanAggregated(getValue())
        return formatted ? (
          <span className="text-xs text-muted-foreground">{formatted}</span>
        ) : null
      }
    } else if (branch.type === "number") {
      baseColumn.aggregationFn = "sum"
      baseColumn.aggregatedCell = ({ getValue, row }) => {
        const count = row.subRows?.length ?? 0
        return (
          <span className="text-xs text-muted-foreground">
            {formatSum(getValue(), count, translate)}
          </span>
        )
      }
    } else {
      // text, richtext, file, json e altri → solo conteggio
      baseColumn.aggregationFn = "count"
      baseColumn.aggregatedCell = ({ row }) => {
        const count = row.subRows?.length ?? 0
        return (
          <span className="text-xs text-muted-foreground">
            {count}{" "}
            {count === 1 ? translate("content.table.item") : translate("content.table.items")}
          </span>
        )
      }
    }

    const maxLength = maxLengths?.[branch.alias]
    return {
      ...baseColumn,
      cell: ({ row }) => (
        <FieldDisplay
          branch={branch}
          value={row.original.data[branch.alias]}
          options={typeof maxLength === "number" ? { maxLength } : undefined}
        />
      ),
    }
  })

  // Colonna Azioni (sempre ultima): Copia ID, Modifica via onEdit, Elimina via onDelete
  const actionsColumn: ColumnDef<ContentEntry> = {
    id: "actions",
    enableHiding: false,
    enableResizing: false,
    size: 56,
    cell: ({ row }) => {
      const entry = row.original
      const hasBulkSelection = selectedIds.length > 1

      return (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <span className="sr-only">{translate("common.openMenu")}</span>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>{translate("content.actions.label")}</DropdownMenuLabel>
              {hasBulkSelection ? (
                <>
                  <DropdownMenuItem onClick={() => onBulkEdit?.(selectedIds)}>
                    {translate("bulkEdit.trigger")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onBulkDelete?.(selectedIds)}
                    className="text-destructive focus:text-destructive"
                  >
                    {translate("common.delete")}
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(entry.id).then(
                        () => toast.success(translate("common.copied")),
                        () => toast.error(translate("common.copyFailed"))
                      )
                    }}
                  >
                    {translate("content.actions.copyId")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      onEdit(entry.id)
                    }}
                  >
                    {translate("common.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(entry.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    {translate("common.delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  }

  return [...fixedColumns, ...dynamicColumns, actionsColumn]
}
