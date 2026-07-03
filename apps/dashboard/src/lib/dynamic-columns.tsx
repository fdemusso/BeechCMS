// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ColumnDef, AggregationFn, GroupingColumnDef } from "@tanstack/react-table"
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
  Link as LinkIcon
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
import {
  matchesFilterGroup,
  normalizeDateToYmd,
} from "@/lib/filter-dsl"
import {
  pendingDraftBadgeClass,
  shouldShowPendingDraftBadge,
} from "@/lib/pending-draft"

/** Minimum character length threshold for dynamic cell truncation. */
const MIN_TRUNCATE_LENGTH = 20
/** Maximum character length threshold for dynamic cell truncation to prevent overflow. */
const MAX_TRUNCATE_LENGTH = 60

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

// ============================================================================
// Types and constants for date grouping
// ============================================================================

/**
 * Granularity precision levels for grouping table rows by dates.
 * - `year` and `month` can be combined (e.g. "January 2024").
 * - `day` is exclusive: if day is true, month/year are ignored.
 */
export interface DateGroupPrecision {
  /** Groups by calendar year. */
  year: boolean
  /** Groups by calendar month. */
  month: boolean
  /** Exclusive: Groups by exact calendar day. */
  day: boolean
}

/** Default date grouping configuration precision. */
export const DEFAULT_DATE_GROUP_PRECISION: DateGroupPrecision = {
  year: true,
  month: true,
  day: false,
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

// ============================================================================
// Helpers for grouping and aggregation
// ============================================================================

/**
 * Converts a raw date value into a formatted grouping key based on precision.
 *
 * @param value - The raw date value (ISO string or epoch).
 * @param precision - Precision grouping rules.
 * @returns A string suitable for grouping headers.
 */
function getDateGroupValue(
  value: unknown,
  precision: DateGroupPrecision = DEFAULT_DATE_GROUP_PRECISION
): string {
  const normalizedYmd = normalizeDateToYmd(value)
  if (!normalizedYmd) return "—"
  // Force UTC midnight to avoid timezone drift
  const date = new Date(normalizedYmd + "T00:00:00")

  if (precision.day) {
    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  }

  const parts: string[] = []
  if (precision.month) {
    parts.push(date.toLocaleDateString("en-US", { month: "long" }))
  }
  if (precision.year) {
    parts.push(String(date.getFullYear()))
  }
  return parts.length ? parts.join(" ") : String(date.getFullYear())
}

/**
 * Custom aggregation function for boolean columns.
 * Tallies total true and false results within grouped subrows.
 */
const booleanAggFn: AggregationFn<ContentEntry> = (columnId, leafRows) => {
  let trueCount = 0
  let falseCount = 0
  for (const row of leafRows) {
    const cellValue = row.getValue(columnId)
    if (cellValue === true) {
      trueCount++
    } else if (cellValue === false) {
      falseCount++
    }
  }
  return { trueCount, falseCount }
}

/**
 * Formats aggregated boolean values count as Check/Cross indicator strings.
 *
 * @param value - The aggregated value object containing counts.
 * @returns A formatted string or empty.
 */
function formatBooleanAggregated(value: unknown): string {
  if (
    value != null &&
    typeof value === "object" &&
    "trueCount" in value &&
    "falseCount" in value
  ) {
    const { trueCount, falseCount } = value as { trueCount: number; falseCount: number }
    return `✓ ${trueCount} / ✗ ${falseCount}`
  }
  return ""
}

/**
 * Formats numeric sums for aggregated column groups.
 *
 * @param value - The aggregated numerical value sum.
 * @param count - The total count of leaf rows in the group.
 * @param translate - Localization translate callback function.
 * @returns A localized string summarizing the aggregation.
 */
function formatSum(value: unknown, count: number, translate: (key: string, options?: any) => string): string {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return `Σ ${value.toLocaleString("en-US")} · ${count} ${count === 1 ? translate("content.table.item") : translate("content.table.items")}`
  }
  return `${count} ${count === 1 ? translate("content.table.item") : translate("content.table.items")}`
}

// ============================================================================
// Width / truncation computation
// ============================================================================

/**
 * Computes the maximum string content length across a preview page of rows to set truncation thresholds.
 *
 * @param firstPage - List of entries in the first page layout.
 * @param alias - The field alias to check.
 * @returns An integer representing the target truncation length.
 */
function computeMaxStringLength(firstPage: ContentEntry[], alias: string): number {
  let max = 0
  for (const row of firstPage) {
    const cellValue = row.data[alias]
    if (cellValue == null) continue
    const textLength = String(cellValue).length
    if (textLength > max) max = textLength
  }
  return Math.min(
    Math.max(max, MIN_TRUNCATE_LENGTH),
    MAX_TRUNCATE_LENGTH
  )
}

/**
 * Computes maximum string content length for serializable JSON column values.
 *
 * @param firstPage - List of entries in the first page layout.
 * @param alias - The field alias to check.
 * @returns An integer representing the target truncation length, or null if tags.
 */
function computeMaxJsonLength(
  firstPage: ContentEntry[],
  alias: string,
): number | null {
  const isTagsField = alias.toLowerCase().includes("tag")
  if (isTagsField) return null

  let max = 0
  for (const row of firstPage) {
    const cellValue = row.data[alias]
    if (cellValue == null) continue

    let serializedString: string
    if (typeof cellValue === "string") {
      try {
        serializedString = JSON.stringify(JSON.parse(cellValue))
      } catch {
        serializedString = cellValue
      }
    } else {
      serializedString = JSON.stringify(cellValue)
    }

    if (serializedString.length > max) max = serializedString.length
  }

  return Math.min(
    Math.max(max, MIN_TRUNCATE_LENGTH),
    MAX_TRUNCATE_LENGTH
  )
}

/**
 * Dispatches to the appropriate length computation helper based on the branch type.
 *
 * @param branch - The branch seed configuration.
 * @param firstPage - List of entries in the first page layout.
 * @returns Truncation length limit or null.
 */
function computeMaxLengthForBranch(
  branch: Seed["branches"][number],
  firstPage: ContentEntry[],
): number | null {
  if (branch.type === "json") return computeMaxJsonLength(firstPage, branch.alias)
  if (branch.type === "text") return computeMaxStringLength(firstPage, branch.alias)
  return computeMaxStringLength(firstPage, branch.alias)
}

/**
 * Loops over all branches in a schema seed and computes consistent truncation lengths
 * based on values found in the first page of content.
 *
 * @param data - The full list of entries available.
 * @param seed - The schema seed structure.
 * @param rowsPerPage - Pagination limits representing the first page bounds.
 * @returns Dictionary mapping field alias keys to character length thresholds.
 */
export function computeMaxLengths(
  data: ContentEntry[],
  seed: Seed,
  rowsPerPage: number
): Record<string, number> {
  const result: Record<string, number> = {}
  const firstPage = data.slice(0, rowsPerPage)

  for (const branch of seed.branches) {
    const maxLength = computeMaxLengthForBranch(branch, firstPage)
    if (maxLength == null) continue
    result[branch.alias] = maxLength
  }

  return result
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
  onBulkEdit?: (ids: string[]) => void,
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
        return (
          <span className="text-muted-foreground text-sm">
            {slug ?? "—"}
          </span>
        )
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
        const hasPendingDraft = shouldShowPendingDraftBadge(row.original.status, row.original.has_pending_draft)
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
      cell: ({ row }) => <RelativeTime value={row.original.updated_at} className="text-sm text-muted-foreground" />,
      enableSorting: false,
    },
    {
      id: "created_at",
      size: 160,
      minSize: 80,
      maxSize: 400,
      accessorFn: (row) => row.created_at,
      header: translate("content.table.created"),
      cell: ({ row }) => <RelativeTime value={row.original.created_at} className="text-sm text-muted-foreground" />,
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
            {label} · {count} {count === 1 ? translate("content.table.item") : translate("content.table.items")}
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
            {count} {count === 1 ? translate("content.table.item") : translate("content.table.items")}
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
