import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { getSeed } from "@beech/core"
import type {
  SortingState,
  ColumnFiltersState,
  RowSelectionState,
  VisibilityState,
  GroupingState,
} from "@tanstack/react-table"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { DataTable } from "@/components/ui/data-table"
import { ContentDeleteDialog } from "@/components/content-delete-dialog"
import { ContentGallery } from "@/components/content-gallery"
import {
  ContentToolbar,
  type UserViewInstance,
  type ToolbarFiltersState,
  type ToolbarFilterGroup,
  type ToolbarFilterCondition,
} from "@/components/content-toolbar"
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { toast } from "sonner"
import {
  fetchContentListServer,
  fetchContentFacets,
  deleteContent,
} from "@/lib/content-api"
import {
  generateColumns,
  computeMaxLengths,
  type ContentEntry,
  type DateGroupPrecision,
  DEFAULT_DATE_GROUP_PRECISION,
} from "@/lib/dynamic-columns"
import {
  type ConditionalFormatRule,
  getConditionalFormatCellClass,
  getConditionalFormatRowClass,
} from "@/lib/conditional-format"
import {
  matchesFilterGroupStrict,
  type FilterGroupType,
} from "@/lib/filter-dsl"
import { extractTagNames } from "@/lib/tags-utils"

export function ContentListPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [data, setData] = React.useState<ContentEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [totalRows, setTotalRows] = React.useState(0)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [availableStatusOptions, setAvailableStatusOptions] = React.useState<string[]>([])
  const [availableTagsByColumnIdFromServer, setAvailableTagsByColumnIdFromServer] =
    React.useState<Record<string, string[]>>({})

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [entryIdsToDelete, setEntryIdsToDelete] = React.useState<string[] | null>(
    null
  )
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // Vista attiva della lista contenuti.
  const [activeViewId, setActiveViewId] = React.useState("table")

  // Ricerca tabella (collegata alla barra di ricerca nella toolbar)
  const [tableSearch, setTableSearch] = React.useState("")

  // Ordinamento tabella (controllato, singola colonna)
  const [sorting, setSorting] = React.useState<SortingState>([])

  // Filtri tabella (Notion-like): 1 pill per colonna, più condizioni AND
  const [toolbarFilters, setToolbarFilters] = React.useState<ToolbarFiltersState>(
    {}
  )
  const ROWS_PER_PAGE = 10
  const [pageSize, setPageSize] = React.useState<number>(ROWS_PER_PAGE)

  // Recupera il seed
  const seed = slug ? getSeed(slug) : null

  // Raggruppamento tabella: singola colonna o null
  const [groupBy, setGroupBy] = React.useState<string | null>(null)

  // Precisione per branch di tipo date (anno/mese/giorno)
  const [dateGroupPrecision, setDateGroupPrecision] = React.useState<DateGroupPrecision>(
    DEFAULT_DATE_GROUP_PRECISION
  )

  // Quando il raggruppamento cambia verso una colonna non-date, resetta la precisione
  React.useEffect(() => {
    if (!groupBy || !seed) return
    const branch = seed.branches.find((b) => b.alias === groupBy)
    if (branch?.type !== "date") {
      setDateGroupPrecision(DEFAULT_DATE_GROUP_PRECISION)
    }
  }, [groupBy, seed])

  // Viste disponibili per il seed corrente.
  // TODO: caricare e salvare la configurazione delle viste a livello di utente (quando esisterà un sistema di preferenze utente).
  const [views, setViews] = React.useState<UserViewInstance[]>(() => [
    {
      id: "table",
      label: "Tabella",
      type: "table",
      enabledTools: [
        "filter",
        "sort",
        "automation",
        "search",
        "settings",
        "create",
      ],
      conditionalFormats: [],
    },
    {
      id: "gallery",
      label: "Galleria",
      type: "gallery",
      enabledTools: ["filter", "sort", "search", "create"],
      conditionalFormats: [],
    },
  ])

  const activeView = React.useMemo(() => {
    return views.find((v) => v.id === activeViewId)
  }, [activeViewId, views])

  const handleConditionalFormatsChange = React.useCallback(
    (viewId: string, next: ConditionalFormatRule[]) => {
      setViews((prev) =>
        prev.map((v) => (v.id === viewId ? { ...v, conditionalFormats: next } : v))
      )
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

      // Riga: prima regola che matcha
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

      // Cella: valutiamo solo per le colonne che hanno regole
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

  const loadData = React.useCallback(async () => {
    if (!slug) return

    setIsLoading(true)
    setError(null)
    setAvailableStatusOptions([])
    setAvailableTagsByColumnIdFromServer({})

    try {
      const list = await fetchContentListServer(slug, {
        page: pageIndex + 1,
        limit: pageSize,
        search: tableSearch.trim() || undefined,
        sortBy: sorting[0]?.id,
        sortDir: sorting[0]?.desc ? "desc" : "asc",
        filters: toolbarFilters,
      })
      setData(list.items)
      setTotalRows(list.total)

      try {
        const facets = await fetchContentFacets(slug)
        setAvailableStatusOptions(facets.statuses)
        setAvailableTagsByColumnIdFromServer(facets.tagsByColumnId)
      } catch {
        setAvailableStatusOptions([])
        setAvailableTagsByColumnIdFromServer({})
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore durante il caricamento dei dati"
      )
    } finally {
      setIsLoading(false)
    }
  }, [pageIndex, pageSize, slug, sorting, tableSearch, toolbarFilters])

  // Fetch data iniziale
  React.useEffect(() => {
    if (!slug || !seed) {
      setError(
        slug
          ? `Seed "${slug}" non trovato nel registro`
          : "Slug non specificato"
      )
      setIsLoading(false)
      return
    }

    loadData()
  }, [slug, seed, loadData])

  React.useEffect(() => {
    setPageIndex(0)
  }, [slug, tableSearch, sorting, toolbarFilters, pageSize])

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

  const handleCreate = React.useCallback(() => {
    if (slug) navigate(`/content/${slug}/create`)
  }, [slug, navigate])

  const handleConfirmDelete = React.useCallback(async () => {
    if (!slug || !entryIdsToDelete || entryIdsToDelete.length === 0) return

    const results = await Promise.allSettled(
      entryIdsToDelete.map((id) => deleteContent(slug, id))
    )
    const failures = results.filter((r) => r.status === "rejected").length
    if (failures > 0) {
      throw new Error(
        `Eliminazione parziale: ${failures} su ${entryIdsToDelete.length} fallite`
      )
    }

    await loadData()
    setRowSelection({})
  }, [slug, entryIdsToDelete, loadData])

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

  // Lunghezza max per colonna (dalla prima pagina) per troncamento consistente
  const maxLengths = React.useMemo(() => {
    if (!seed || data.length === 0) return undefined
    return computeMaxLengths(data, seed, pageSize)
  }, [seed, data, pageSize])

  // Genera colonne (si rigenera quando cambia la precisione date per aggiornare getGroupingValue)
  const columns = React.useMemo(() => {
    if (!seed) return []
    return generateColumns(
      seed,
      handleEdit,
      handleDelete,
      maxLengths,
      selectedIds,
      handleBulkDelete,
      dateGroupPrecision
    )
  }, [seed, handleEdit, handleDelete, maxLengths, selectedIds, handleBulkDelete, dateGroupPrecision])

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
      ...Object.keys(availableTagsByColumnIdFromServer),
    ])
    const result: Record<string, string[]> = {}
    for (const alias of aliases) {
      const set = new Set<string>([
        ...(availableTagsByColumnIdFromData[alias] ?? []),
        ...(availableTagsByColumnIdFromServer[alias] ?? []),
      ])
      result[alias] = Array.from(set).sort((a, b) => a.localeCompare(b, "it"))
    }
    return result
  }, [availableTagsByColumnIdFromData, availableTagsByColumnIdFromServer])

  const effectiveStatusOptions = React.useMemo(() => {
    if (availableStatusOptions.length > 0) return availableStatusOptions
    return availableStatusOptionsFromData
  }, [availableStatusOptions, availableStatusOptionsFromData])

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
    // TanStack può non ricalcolare subito i gruppi quando cambia solo getGroupingValue.
    // Forziamo un remount della tabella quando il grouping attivo è su date e cambia la precisione.
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
      // Passiamo al table state solo i gruppi che hanno almeno 1 condizione “effettiva”.
      const hasEffectiveCondition = group.conditions.some((c) =>
        isConditionEffective(group, c)
      )
      if (!hasEffectiveCondition) continue
      next.push({ id: columnId, value: group })
    }
    return next
  }, [toolbarFilters])

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
      setViews((prev) =>
        prev.map((view) =>
          view.id === viewId ? { ...view, label } : view
        )
      )
    },
    []
  )

  // Colonne nascoste di default: id (troppo lungo), json metadata/metadati
  const initialHiddenColumns = React.useMemo(() => {
    const hidden: string[] = ["id"]
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

  // Se non c'è seed, mostra errore
  if (!seed) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="mx-auto w-full max-w-screen-2xl">
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                    <h2 className="text-lg font-semibold text-destructive">
                      Errore
                    </h2>
                    <p className="text-sm text-destructive/90">
                      {error || `Seed "${slug}" non trovato`}
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

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-hidden">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-w-0">
              <div className="mx-auto w-full max-w-screen-2xl">
                {/* Header con titolo */}
                <div className="mb-6">
                  <h1 className="text-2xl font-semibold">{seed.labelPlural ?? seed.label}</h1>
                  <p className="text-muted-foreground text-sm">
                    Gestisci i contenuti di tipo "{seed.slug}"
                  </p>
                </div>

                {/* Toolbar viste, strumenti e contenuto (tabella + controlli) */}
                <ContentToolbar
                  seed={seed}
                  views={views}
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
                >
                  {error && (
                    <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}
                  {isLoading && !error && (
                    activeViewId === "table" && (
                      <div className="flex items-center justify-center py-12">
                        <div className="text-muted-foreground">Caricamento...</div>
                      </div>
                    )
                  )}
                  {!isLoading && !error && activeViewId === "table" && (
                    <DataTable
                      key={tableKey}
                      columns={columns}
                      data={data}
                      initialHiddenColumns={initialHiddenColumns}
                      getRowStyles={getRowStyles}
                      rowSelection={rowSelection}
                      onRowSelectionChange={setRowSelection}
                      grouping={grouping}
                      onGroupingChange={(g) => setGroupBy(g[0] ?? null)}
                      renderRowContextMenuContent={(entry) => (
                        <>
                          <ContextMenuLabel>Azioni</ContextMenuLabel>
                          {selectedIds.length > 1 ? (
                            <ContextMenuItem
                              onSelect={() => handleBulkDelete(selectedIds)}
                              className="text-destructive focus:text-destructive"
                            >
                              Elimina
                            </ContextMenuItem>
                          ) : (
                            <>
                              <ContextMenuItem
                                onSelect={() => {
                                  navigator.clipboard.writeText(entry.id).then(
                                    () => toast.success("ID copiato"),
                                    () => toast.error("Copia fallita")
                                  )
                                }}
                              >
                                Copia ID
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onSelect={() => handleEdit(entry.id)}
                              >
                                Modifica
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => handleDelete(entry.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                Elimina
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
                </ContentToolbar>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      {/* Modal Delete */}
      <ContentDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        seed={seed}
        entryIds={entryIdsToDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
