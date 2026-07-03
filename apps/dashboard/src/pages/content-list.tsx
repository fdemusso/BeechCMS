// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom"
import { EntryEditorDialog } from "@/features/entry-editor"
import type {
  SortingState,
  ColumnFiltersState,
  ColumnSizingState,
  RowSelectionState,
  VisibilityState,
  GroupingState,
} from "@tanstack/react-table"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { DataTable } from "@/components/ui/data-table"
import { ContentDeleteDialog } from "@/features/content-delete-dialog"
import { BulkEditDialog } from "@/features/bulk-edit"
import { ContentGallery } from "@/features/content-gallery"
import { ContentKanban, useKanbanEntrySync } from "@/features/content-kanban"
import { CardConfigDialog } from "@/features/content-kanban/card-config/card-config-dialog"
import { useKanbanViewConfig } from "@/features/content-kanban/hooks/use-kanban-view-config"
import { resolveKanbanConfig, resolveAuthorizedViews, isViewAuthorized } from "@beechcms/core"
import type { DashboardView } from "@beechcms/core"
import { viewRegistry } from "@/features/content-toolbar/view-registry"
import {
  ContentToolbar,
  type UserViewInstance,
  type ToolbarFiltersState,
  type ToolbarFilterGroup,
  type ToolbarFilterCondition,
  buildFilterableColumns,
  defaultOperatorForType,
  generateConditionId,
} from "@/features/content-toolbar"
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { toast } from "sonner"
import { SmallCta } from "@/components/ui/small-cta"
import {
  useContentList,
  useContentFacets,
  useDeleteContent,
} from "@/features/content-management"
import { AutomationPanel, useAutomations } from "@/features/automations"
import { useActiveSeed } from "@/features/schema"
import {
  generateColumns,
  computeMaxLengths,
  type ContentEntry,
  type DateGroupPrecision,
  DEFAULT_DATE_GROUP_PRECISION,
} from "@/lib/dynamic-columns"
import { useDebounce } from "@/hooks/use-debounce"
import { type TableDensity, DEFAULT_DENSITY } from "@/lib/density"
import {
  type ConditionalFormatRule,
  getConditionalFormatCellClass,
  getConditionalFormatRowClass,
} from "@/lib/conditional-format"
import {
  matchesFilterGroupStrict,
  normalizeDateToYmd,
  type FilterGroupType,
} from "@/lib/filter-dsl"
import { extractTagNames } from "@/lib/tags-utils"

function normalizeCellFilterValue(
  type: FilterGroupType,
  raw: unknown
): string | number | boolean | null {
  switch (type) {
    case "number":
      return typeof raw === "number" ? raw : (raw != null && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null)
    case "boolean":
      return typeof raw === "boolean" ? raw : null
    case "tags": {
      const names = extractTagNames(raw)
      return names.length > 0 ? names[0] : null
    }
    case "date":
      return normalizeDateToYmd(raw)
    case "select":
    case "text":
    case "system":
    default: {
      const s = raw == null ? "" : String(raw).trim()
      return s.length > 0 ? s : null
    }
  }
}

export function ContentListPage() {
  const { slug, id: entryId } = useParams<{ slug: string; id?: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const location = useLocation()
  const isCreatePath = location.pathname.endsWith("/create")
  const isEditPath = !!entryId && !isCreatePath
  const dialogOpen = isCreatePath || isEditPath

  const isDraftContext = !!(location.state as { isDraftContext?: boolean } | null)?.isDraftContext
  const createDefaults = (location.state as { defaultValues?: Record<string, unknown> } | null)?.defaultValues

  const handleDialogClose = React.useCallback(
    () => navigate(`/content/${slug}`),
    [navigate, slug]
  )

  const [target, setTarget] = React.useState<{
    schemaSlug: string
    entryId: string | undefined
    isDraftContext: boolean
  } | null>(null)

  React.useEffect(() => {
    if (dialogOpen && slug) {
      setTarget({ schemaSlug: slug, entryId: isCreatePath ? undefined : entryId, isDraftContext })
    }
  }, [dialogOpen, slug, entryId, isCreatePath, isDraftContext])

  React.useEffect(() => {
    if (!dialogOpen && target) {
      const id = window.setTimeout(() => setTarget(null), 150)
      return () => window.clearTimeout(id)
    }
  }, [dialogOpen, target])

  // --- STATE ---
  const [pageIndex, setPageIndex] = React.useState(0)
  const ROWS_PER_PAGE = 10
  const [pageSize, setPageSize] = React.useState<number>(ROWS_PER_PAGE)
  const [tableSearch, setTableSearch] = React.useState("")
  const debouncedSearch = useDebounce(tableSearch, 300)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [searchParams] = useSearchParams()
  const prefilterStatus = searchParams.get("status")
  const requestedView = searchParams.get("view")

  const [toolbarFilters, setToolbarFilters] = React.useState<ToolbarFiltersState>(() => {
    if (!prefilterStatus) return {} as ToolbarFiltersState
    return {
      status: {
        columnId: "status",
        label: "Status",
        type: "select",
        conditions: [{ id: "status-prefilter", op: "eq", value: prefilterStatus }],
        selectOptions: ["draft", "published"],
      },
    }
  })

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [entryIdsToDelete, setEntryIdsToDelete] = React.useState<string[] | null>(null)
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false)

  const [automationPanelOpen, setAutomationPanelOpen] = React.useState(false)

  // Active view of the content list.
  const [activeViewId, setActiveViewId] = React.useState("table")

  // Fetch the seed reactively
  const { seed, isLoading: isSeedLoading } = useActiveSeed(slug)

  const kanbanSync = useKanbanEntrySync(seed, slug ?? '')

  // Table grouping: single column or null
  const [groupBy, setGroupBy] = React.useState<string | null>(null)

  // Precision for date-type branches (year/month/day)
  const [dateGroupPrecision, setDateGroupPrecision] = React.useState<DateGroupPrecision>(
    DEFAULT_DATE_GROUP_PRECISION
  )

  // --- DATA FETCHING (TANSTACK QUERY) ---
  const { 
    data: listData, 
    isLoading: isListLoading, 
    error: listError,
  } = useContentList(slug, {
    page: pageIndex + 1,
    limit: pageSize,
    search: debouncedSearch.trim() || undefined,
    sortBy: sorting[0]?.id,
    sortDir: sorting[0]?.desc ? "desc" : "asc",
    filters: toolbarFilters,
  })

  const { 
    data: facetsData,
  } = useContentFacets(slug)

  const { mutateAsync: deleteContent } = useDeleteContent()

  useAutomations(slug)

  const data = React.useMemo(() => listData?.items ?? [], [listData])
  const totalRows = listData?.total ?? 0
  const isLoading = isListLoading
  const error = listError ? (listError as Error).message : null

  // --- EFFECTS & DERIVED STATE ---

  // Reset pagination when filter/slug changes
  React.useEffect(() => {
    setPageIndex(0)
  }, [slug, debouncedSearch, sorting, toolbarFilters, pageSize])

  // When grouping changes to a non-date column, reset precision
  React.useEffect(() => {
    if (!groupBy || !seed) return
    const branch = seed.branches.find((b) => b.alias === groupBy)
    if (branch?.type !== "date") {
      setDateGroupPrecision(DEFAULT_DATE_GROUP_PRECISION)
    }
  }, [groupBy, seed])

  const kanbanCompat = React.useMemo(() => seed ? resolveKanbanConfig(seed) : null, [seed])
  const { kanbanConfig, setKanbanConfig, cardConfig, setCardConfig, isSaving: isKanbanConfigSaving } = useKanbanViewConfig(slug ?? '')
  const [cardConfigOpen, setCardConfigOpen] = React.useState(false)
  const kanbanCandidates = kanbanCompat?.compatible ? kanbanCompat.candidates : []
  const kanbanAxisBranch = React.useMemo(
    () => seed?.branches.find(b => b.id === kanbanConfig?.axisBranchId),
    [seed, kanbanConfig?.axisBranchId],
  )

  // TODO: load and save view configuration at the user level (when a user preferences system exists).
  const authorizedViews = React.useMemo<DashboardView[]>(
    () => (seed ? resolveAuthorizedViews(seed) : ['table']),
    [seed]
  )

  // Per-view mutable overlays (conditional formats, label overrides) — in-memory only.
  const [viewOverlays, setViewOverlays] = React.useState<
    Record<string, { conditionalFormats?: ConditionalFormatRule[]; label?: string }>
  >({})

  const views = React.useMemo<UserViewInstance[]>(
    () => authorizedViews.map((type) => {
      const def = viewRegistry.get(type)
      const overlay = viewOverlays[type] ?? {}
      return {
        id: type,
        label: overlay.label ?? type,
        type,
        enabledTools: def?.enabledTools ?? ['filter', 'search', 'create'],
        conditionalFormats: overlay.conditionalFormats ?? [],
      }
    }),
    [authorizedViews, viewOverlays]
  )

  React.useEffect(() => {
    if (!seed) return
    const target = requestedView && isViewAuthorized(seed, requestedView) ? requestedView : 'table'
    setActiveViewId((cur) => (authorizedViews.includes(cur as DashboardView) ? cur : target))
  }, [seed, requestedView, authorizedViews])

  const VIEW_LABELS: Record<string, string> = {
    table: t("content.list.table"),
    gallery: t("content.list.gallery"),
    kanban: t("content.list.kanban", { defaultValue: "Kanban" }),
  }
  const translatedViews = React.useMemo(
    () => views.map((v) => ({ ...v, label: VIEW_LABELS[v.type] ?? v.label })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [views, t]
  )

  const activeView = React.useMemo(() => {
    return views.find((v) => v.id === activeViewId)
  }, [activeViewId, views])

  const handleConditionalFormatsChange = React.useCallback(
    (viewId: string, next: ConditionalFormatRule[]) => {
      setViewOverlays((prev) => ({ ...prev, [viewId]: { ...prev[viewId], conditionalFormats: next } }))
    },
    []
  )

  const getEntryValueForColumn = React.useCallback(
    (entry: ContentEntry, columnId: string): unknown => {
      if (columnId === "id") return entry.id
      if (columnId === "slug") return entry.slug
      if (columnId === "status") return entry.status
      return entry.data?.[columnId]
    },
    []
  )

  const tagsParseCacheRef = React.useRef<Map<string, unknown>>(new Map())

  React.useEffect(() => {
    tagsParseCacheRef.current.clear()
  }, [slug, data])

  const getCachedValueForGroupType = React.useCallback(
    (entry: ContentEntry, columnId: string, groupType: FilterGroupType): unknown => {
      const value = getEntryValueForColumn(entry, columnId)
      if (groupType !== "tags") return value

      const key = `${entry.id}::${columnId}`
      if (tagsParseCacheRef.current.has(key)) {
        return tagsParseCacheRef.current.get(key)
      }

      let parsed: unknown = value
      if (typeof value === "string") {
        try {
          parsed = JSON.parse(value) as unknown
        } catch {
          parsed = null
        }
      }
      tagsParseCacheRef.current.set(key, parsed)
      return parsed
    },
    [getEntryValueForColumn]
  )

  const conditionalRules = React.useMemo(() => {
    const rules = activeView?.conditionalFormats ?? []
    return rules
      .filter((r) => Boolean(r?.enabled))
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  }, [activeView?.conditionalFormats])

  const rowRules = React.useMemo(() => {
    return conditionalRules.filter((r) => {
      const legacyTarget = (r as { target?: string }).target
      return legacyTarget === "row" || legacyTarget === "cell+row"
    })
  }, [conditionalRules])

  const cellRulesByColumnId = React.useMemo(() => {
    const map = new Map<string, ConditionalFormatRule[]>()
    for (const r of conditionalRules) {
      const legacyTarget = (r as { target?: string }).target
      if (legacyTarget === "row") continue
      const arr = map.get(r.columnId) ?? []
      arr.push(r)
      map.set(r.columnId, arr)
    }
    return map
  }, [conditionalRules])

  const getRowStyles = React.useCallback(
    (entry: ContentEntry) => {
      let rowClassName: string | undefined
      const cellClassNameByColumnId: Record<string, string | undefined> = {}

      // Row: first matching rule
      for (const rule of rowRules) {
        const value = getCachedValueForGroupType(entry, rule.columnId, rule.group.type)
        if (matchesFilterGroupStrict(value, rule.group)) {
          rowClassName = getConditionalFormatRowClass(
            rule.tone,
            rule.textStyles ?? []
          )
          break
        }
      }

      // Cell: evaluated only for columns with rules
      for (const [columnId, rules] of cellRulesByColumnId.entries()) {
        for (const rule of rules) {
          const value = getCachedValueForGroupType(entry, rule.columnId, rule.group.type)
          if (matchesFilterGroupStrict(value, rule.group)) {
            cellClassNameByColumnId[columnId] = getConditionalFormatCellClass(
              rule.tone,
              rule.textStyles ?? []
            )
            break
          }
        }
      }

      return { rowClassName, cellClassNameByColumnId }
    },
    [cellRulesByColumnId, getCachedValueForGroupType, rowRules]
  )

  // --- Handlers --- (to be used below)

  const handleEdit = React.useCallback(
    (id: string) => {
      if (slug) navigate(`/content/${slug}/${id}`)
    },
    [slug, navigate]
  )

  const handleDelete = React.useCallback((id: string) => {
    setEntryIdsToDelete([id])
    setDeleteDialogOpen(true)
  }, [])

  const handleBulkDelete = React.useCallback((ids: string[]) => {
    const unique = Array.from(new Set(ids)).filter(Boolean)
    if (!unique.length) return
    setEntryIdsToDelete(unique)
    setDeleteDialogOpen(true)
  }, [])

  const handleCreate = React.useCallback(
    (defaultValues?: Record<string, unknown> | React.SyntheticEvent | Event) => {
      if (!slug) return

      const isEvent =
        defaultValues &&
        (defaultValues instanceof Event ||
          (typeof defaultValues === "object" &&
            ("nativeEvent" in defaultValues || "preventDefault" in defaultValues)))

      if (defaultValues && !isEvent) {
        navigate(`/content/${slug}/create`, {
          state: { defaultValues: defaultValues as Record<string, unknown> },
        })
      } else {
        navigate(`/content/${slug}/create`)
      }
    },
    [slug, navigate],
  )

  const handleConfirmDelete = React.useCallback(async () => {
    if (!slug || !entryIdsToDelete || entryIdsToDelete.length === 0) return

    const results = await Promise.allSettled(
      entryIdsToDelete.map((id) => deleteContent({ slug, id }))
    )
    const failures = results.filter((r) => r.status === "rejected").length
    if (failures > 0) {
      throw new Error(
        `Partial deletion: ${failures} out of ${entryIdsToDelete.length} failed`
      )
    }

    // Note: TanStack Query will invalidate automatically or we'll use queryClient.invalidateQueries
    // For now leave as is, it will reload on next fetch or page switch.
    // TODO: Insert queryClient.invalidateQueries(CONTENT_QUERY_KEYS.all)
    setRowSelection({})
  }, [slug, entryIdsToDelete, deleteContent])

  const selectedIds = React.useMemo(() => {
    return Object.keys(rowSelection).filter((id) => rowSelection[id])
  }, [rowSelection])

  const pageCount = React.useMemo(() => {
    if (totalRows <= 0) return 1
    return Math.max(1, Math.ceil(totalRows / pageSize))
  }, [pageSize, totalRows])

  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    () => {
      const visibility: VisibilityState = {}
      visibility["id"] = false
      visibility["slug"] = false
      visibility["created_at"] = false
      if (!seed) return visibility
      const metaAliases = seed.branches
        .filter(
          (b) =>
            b.type === "json" &&
            (b.alias.toLowerCase().includes("metadata") ||
              b.alias.toLowerCase().includes("metadati"))
        )
        .map((b) => b.alias)
      for (const alias of metaAliases) {
        visibility[alias] = false
      }
      return visibility
    }
  )

  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})
  const [density, setDensity] = React.useState<TableDensity>(DEFAULT_DENSITY)

  // Lunghezza max per colonna (dalla prima pagina) per troncamento consistente
  const maxLengths = React.useMemo(() => {
    if (!seed || data.length === 0) return undefined
    return computeMaxLengths(data, seed, pageSize)
  }, [seed, data, pageSize])

  // Genera colonne (si rigenera quando cambia la precisione date per aggiornare getGroupingValue)
  const handleBulkEdit = React.useCallback((ids: string[]) => {
    const unique = Array.from(new Set(ids)).filter(Boolean)
    if (!unique.length) return
    setRowSelection(Object.fromEntries(unique.map((id) => [id, true])))
    setBulkEditOpen(true)
  }, [])

  const columns = React.useMemo(() => {
    if (!seed) return []
    return generateColumns(
      seed,
      handleEdit,
      handleDelete,
      maxLengths,
      selectedIds,
      handleBulkDelete,
      dateGroupPrecision,
      t,
      handleBulkEdit,
    )
  }, [seed, handleEdit, handleDelete, maxLengths, selectedIds, handleBulkDelete, dateGroupPrecision, t, handleBulkEdit])

  const singleSort = sorting[0]

  const availableStatusOptionsFromData = React.useMemo(() => {
    const set = new Set<string>()
    for (const row of data) {
      const status = typeof row.status === "string" ? row.status.trim() : ""
      if (status) set.add(status)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "it"))
  }, [data])

  const availableTagsByColumnIdFromData = React.useMemo(() => {
    if (!seed) return {}
    const tagBranches = seed.branches.filter(
      (b) => b.type === "json" && b.alias.toLowerCase().includes("tag")
    )
    if (tagBranches.length === 0) return {}

    const result: Record<string, string[]> = {}
    for (const branch of tagBranches) {
      const set = new Set<string>(branch.options ?? [])

      for (const row of data) {
        for (const tag of extractTagNames(row.data[branch.alias])) {
          set.add(tag)
        }
      }
      result[branch.alias] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, "it")
      )
    }
    return result
  }, [data, seed])

  const availableTagsByColumnId = React.useMemo(() => {
    const aliases = new Set<string>([
      ...Object.keys(availableTagsByColumnIdFromData),
      ...Object.keys(facetsData?.tagsByColumnId ?? {}),
    ])
    const result: Record<string, string[]> = {}
    for (const alias of aliases) {
      const set = new Set<string>([
        ...(availableTagsByColumnIdFromData[alias] ?? []),
        ...(facetsData?.tagsByColumnId?.[alias] ?? []),
      ])
      result[alias] = Array.from(set).sort((a, b) => a.localeCompare(b, "it"))
    }
    return result
  }, [availableTagsByColumnIdFromData, facetsData?.tagsByColumnId])

  const effectiveStatusOptions = React.useMemo(() => {
    if (facetsData?.statuses && facetsData.statuses.length > 0) return facetsData.statuses
    return availableStatusOptionsFromData
  }, [facetsData?.statuses, availableStatusOptionsFromData])

  const filterableColumns = React.useMemo(
    () => (seed ? buildFilterableColumns(seed, effectiveStatusOptions) : []),
    [seed, effectiveStatusOptions]
  )

  const applyCellFilter = React.useCallback(
    (columnId: string, entry: ContentEntry) => {
      const col = filterableColumns.find((c) => c.columnId === columnId)
      if (!col) return
      const rawValue = getEntryValueForColumn(entry, columnId)
      const value = normalizeCellFilterValue(col.type, rawValue)
      if (value === null && col.type !== "boolean") return
      const op = defaultOperatorForType(col.type)
      const nextCondition: ToolbarFilterCondition = { id: generateConditionId(), op, value }
      setToolbarFilters((prev) => {
        const existing = prev[columnId]
        if (existing?.conditions.some((c) => c.op === op && c.value === value)) return prev
        return {
          ...prev,
          [columnId]: existing
            ? { ...existing, conditions: [...existing.conditions, nextCondition] }
            : { columnId, label: col.label, type: col.type, selectOptions: col.selectOptions, conditions: [nextCondition] },
        }
      })
    },
    [filterableColumns, getEntryValueForColumn]
  )

  const grouping = React.useMemo<GroupingState>(
    () => (groupBy ? [groupBy] : []),
    [groupBy]
  )

  const isGroupingByDate = React.useMemo(() => {
    if (!seed || !groupBy) return false
    const branch = seed.branches.find((b) => b.alias === groupBy)
    return branch?.type === "date"
  }, [groupBy, seed])

  const tableKey = React.useMemo(() => {
    // TanStack might not immediately recalculate groups when only getGroupingValue changes.
    // Force a table remount when active grouping is on date and precision changes.
    if (isGroupingByDate && groupBy) {
      let datePrecisionSegment: string
      if (dateGroupPrecision.day) {
        datePrecisionSegment = "day"
      } else if (dateGroupPrecision.year && !dateGroupPrecision.month) {
        datePrecisionSegment = "year"
      } else {
        datePrecisionSegment = "monthYear"
      }
      return `group:${groupBy}:date:${datePrecisionSegment}`
    }
    return `group:${groupBy ?? "none"}`
  }, [dateGroupPrecision.day, dateGroupPrecision.month, dateGroupPrecision.year, groupBy, isGroupingByDate])

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const next: ColumnFiltersState = []

    const isNonEmptyString = (value: unknown): value is string =>
      typeof value === "string" && value.trim().length > 0

    const isValidNumber = (value: unknown): value is number =>
      typeof value === "number" && !Number.isNaN(value)

    const isEqEffective = (
      groupType: ToolbarFilterGroup["type"],
      value: ToolbarFilterCondition["value"]
    ): boolean => {
      switch (groupType) {
        case "boolean":
          return value === true || value === false
        case "number":
          return isValidNumber(value)
        case "date":
        case "select":
        default:
          return isNonEmptyString(value)
      }
    }

    const isRangeEffective = (
      groupType: ToolbarFilterGroup["type"],
      value: ToolbarFilterCondition["value"]
    ): boolean => {
      switch (groupType) {
        case "number":
          return isValidNumber(value)
        case "date":
          return isNonEmptyString(value)
        default:
          return false
      }
    }

    const isConditionEffective = (
      group: ToolbarFilterGroup,
      c: ToolbarFilterCondition
    ): boolean => {
      switch (c.op) {
        case "is_empty":
        case "is_not_empty":
          return true
        case "contains":
          return isNonEmptyString(c.value)
        case "eq":
          return isEqEffective(group.type, c.value)
        case "gt":
        case "gte":
        case "lt":
        case "lte":
          return isRangeEffective(group.type, c.value)
        default:
          return false
      }
    }

    for (const [columnId, group] of Object.entries(toolbarFilters)) {
      // Pass only groups with at least 1 "effective" condition to the table state.
      const hasEffectiveCondition = group.conditions.some((c) =>
        isConditionEffective(group, c)
      )
      if (!hasEffectiveCondition) continue
      next.push({ id: columnId, value: group })
    }
    return next
  }, [toolbarFilters])

  const hasActiveFilters = columnFilters.length > 0 || debouncedSearch.trim().length > 0
  const isEmptySeed = !isLoading && !hasActiveFilters && totalRows === 0

  const handleTableSortingChange = React.useCallback(
    (next: SortingState) => {
      if (!next.length) {
        setSorting([])
        return
      }
      const [first] = next
      setSorting([{ id: first.id, desc: first.desc ?? false }])
    },
    []
  )

  const handleToolbarSortChange = React.useCallback(
    (state: { columnId: string | null; desc: boolean }) => {
      if (!state.columnId) {
        setSorting([])
        return
      }
      setSorting([{ id: state.columnId, desc: state.desc }])
    },
    []
  )
  const handleRenameView = React.useCallback(
    (viewId: string, label: string) => {
      setViewOverlays((prev) => ({ ...prev, [viewId]: { ...prev[viewId], label } }))
    },
    []
  )

  // Hidden columns by default: system columns (id, slug) + json metadata/metadati
  const initialHiddenColumns = React.useMemo(() => {
    const hidden: string[] = ["id", "slug", "created_at"]
    if (!seed) return hidden
    const metaAliases = seed.branches
      .filter(
        (b) =>
          b.type === "json" &&
          (b.alias.toLowerCase().includes("metadata") ||
            b.alias.toLowerCase().includes("metadati"))
      )
      .map((b) => b.alias)
    return [...hidden, ...metaAliases]
  }, [seed])

  // Show error if seed doesn't exist
  if (!seed && !isSeedLoading) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="content-area-inner">
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                    <h2 className="font-heading text-lg font-semibold text-destructive">
                      Error
                    </h2>
                    <p className="text-sm text-destructive/90">
                      {error || `Seed "${slug}" not found`}
                    </p>
                  </div>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  // Loading skeleton while seed is fetching
  if (isSeedLoading || !seed) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 items-center justify-center py-12">
                <div className="text-muted-foreground">Loading configuration...</div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-clip">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-w-0">
              <div className="content-area-inner">
                {/* Header with title */}
                <div className="mb-6">
                  {/* TODO: Extract this header to a dedicated slice component */}
                  <h1 className="font-heading text-2xl font-semibold">{seed.labelPlural ?? seed.label}</h1>
                  <p className="text-muted-foreground text-sm">
                    Manage "{seed.slug}" content
                  </p>
                </div>

                {/* View toolbar, tools and content (table + controls) */}
                {/* TODO: Consider moving ContentToolbar to content-management slice if not shared */}
                <ContentToolbar
                  seed={seed}
                  views={translatedViews}
                  activeViewId={activeViewId}
                  onChangeView={setActiveViewId}
                  onRenameView={handleRenameView}
                  onConditionalFormatsChange={handleConditionalFormatsChange}
                  onCreate={handleCreate}
                  searchValue={tableSearch}
                  onSearchChange={setTableSearch}
                  sortState={{
                    columnId: singleSort?.id ?? null,
                    desc: singleSort?.desc ?? true,
                  }}
                  onSortChange={handleToolbarSortChange}
                  filters={toolbarFilters}
                  onFiltersChange={setToolbarFilters}
                  availableTagsByColumnId={availableTagsByColumnId}
                  availableStatusOptions={effectiveStatusOptions}
                  pageSize={pageSize}
                  onPageSizeChange={(size) => {
                    setPageSize(size)
                    setPageIndex(0)
                  }}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                  groupBy={groupBy}
                  onGroupByChange={setGroupBy}
                  dateGroupPrecision={dateGroupPrecision}
                  onDateGroupPrecisionChange={setDateGroupPrecision}
                  onOpenAutomation={() => setAutomationPanelOpen(true)}
                  isAutomationActive={automationPanelOpen}
                  density={density}
                  onDensityChange={setDensity}
                  kanbanCandidates={kanbanCandidates}
                  kanbanConfig={kanbanConfig}
                  onKanbanConfigChange={setKanbanConfig}
                  kanbanAxisBranch={kanbanAxisBranch}
                  onOpenCardConfig={() => setCardConfigOpen(true)}
                >
                  {error && (
                    <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}
                  {isLoading && !error && (
                    activeViewId === "table" && (
                      <div className="flex items-center justify-center py-12">
                        <div className="text-muted-foreground">Loading...</div>
                      </div>
                    )
                  )}
                  {!isLoading && !error && activeViewId === "table" && (
                    <DataTable
                      key={tableKey}
                      columns={columns}
                      data={data}
                      initialHiddenColumns={initialHiddenColumns}
                      enableColumnResizing
                      columnSizing={columnSizing}
                      onColumnSizingChange={setColumnSizing}
                      density={density}
                      getRowStyles={getRowStyles}
                      rowSelection={rowSelection}
                      onRowSelectionChange={setRowSelection}
                      onRowDoubleClick={(entry) => handleEdit(entry.id)}
                      onCellActivate={(columnId, entry) => applyCellFilter(columnId, entry)}
                      cellActivateExcludedColumnIds={["select", "actions"]}
                      grouping={grouping}
                      onGroupingChange={(g) => setGroupBy(g[0] ?? null)}
                      renderRowContextMenuContent={(entry) => (
                        <>
                          <ContextMenuLabel>Actions</ContextMenuLabel>
                          {selectedIds.length > 1 ? (
                            <ContextMenuItem
                              onSelect={() => handleBulkDelete(selectedIds)}
                              className="text-destructive focus:text-destructive"
                            >
                              Delete
                            </ContextMenuItem>
                          ) : (
                            <>
                              <ContextMenuItem
                                onSelect={() => {
                                  navigator.clipboard.writeText(entry.id).then(
                                    () => toast.success("ID copied"),
                                    () => toast.error("Copy failed")
                                  )
                                }}
                              >
                                Copy ID
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onSelect={() => handleEdit(entry.id)}
                              >
                                Edit
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => handleDelete(entry.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                Delete
                              </ContextMenuItem>
                            </>
                          )}
                        </>
                      )}
                      pageSize={pageSize}
                      onPageSizeChange={(size) => {
                        setPageSize(size)
                        setPageIndex(0)
                      }}
                      pageIndex={pageIndex}
                      onPageIndexChange={setPageIndex}
                      pageCount={pageCount}
                      totalRows={totalRows}
                      manualPagination
                      manualSorting
                      manualFiltering
                      columnVisibility={columnVisibility}
                      onColumnVisibilityChange={setColumnVisibility}
                      globalFilter={tableSearch}
                      onGlobalFilterChange={setTableSearch}
                      sorting={sorting}
                      onSortingChange={handleTableSortingChange}
                      columnFilters={columnFilters}
                      emptyState={
                        isEmptySeed ? (
                          <SmallCta
                            svgPath={`${import.meta.env.BASE_URL}working.svg`}
                            title={t("content.list.emptyTitle")}
                            buttonText={t("content.list.emptyCreateFirst", { label: seed.label })}
                            onButtonClick={handleCreate}
                          />
                        ) : (
                          <SmallCta
                            svgPath={`${import.meta.env.BASE_URL}noResult.svg`}
                            title={t("common.noResults")}
                          />
                        )
                      }
                    />
                  )}
                  {!error && activeViewId === "gallery" && (
                    <ContentGallery
                      seed={seed}
                      data={data}
                      isLoading={isLoading}
                      onEdit={handleEdit}
                    />
                  )}
                  {!error && activeViewId === "kanban" && slug && seed && (
                    <ContentKanban
                      seed={seed}
                      seedSlug={slug}
                      isLoading={isLoading}
                      onEdit={handleEdit}
                      onCreateEntry={handleCreate}
                      search={debouncedSearch.trim() || undefined}
                      kanbanConfig={kanbanConfig}
                      setKanbanConfig={setKanbanConfig}
                      cardConfig={cardConfig}
                      setCardConfig={setCardConfig}
                      isSaving={isKanbanConfigSaving}
                    />
                  )}
                </ContentToolbar>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      {seed && slug && activeViewId === 'kanban' && (
        <CardConfigDialog
          open={cardConfigOpen}
          onClose={() => setCardConfigOpen(false)}
          seed={seed}
          config={cardConfig}
          onSave={setCardConfig}
        />
      )}

      {/* Modal Delete */}
      <ContentDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        seed={seed}
        entryIds={entryIdsToDelete}
        onConfirm={handleConfirmDelete}
      />

      {/* Modal Bulk Edit */}
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={(open) => {
          setBulkEditOpen(open)
          if (!open) setRowSelection({})
        }}
        seed={seed}
        selectedIds={selectedIds}
      />

      <AutomationPanel
        open={automationPanelOpen}
        onOpenChange={setAutomationPanelOpen}
        seedSlug={seed.slug}
        seedDisplayName={seed.label}
        seedBranches={seed.branches}
      />

      {target && (
        <EntryEditorDialog
          schemaSlug={target.schemaSlug}
          entryId={target.entryId}
          isDraftContext={target.isDraftContext}
          open={dialogOpen}
          onClose={handleDialogClose}
          defaultValues={createDefaults}
          onSaved={(info) => { if (activeViewId === 'kanban') kanbanSync(info) }}
        />
      )}
    </div>
  )
}
