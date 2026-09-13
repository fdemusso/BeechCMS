// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Trash2 } from "reicon-react"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { Button } from "@/components/ui/button"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { ContentGallery } from "@/features/content-gallery"
import { ContentKanban, useKanbanEntrySync, useKanbanViewConfig } from "@/features/content-kanban"
import { resolveKanbanConfig, resolveAuthorizedViews, isViewAuthorized } from "@beechcms/core"
import type { DashboardView } from "@beechcms/core"
import { viewRegistry } from "@/features/content-toolbar/view-registry"
import {
  ContentToolbar,
  type UserViewInstance,
} from "@/features/content-toolbar"
import {
  useContentListQuery,
  useContentTableConfig,
  useContentListModals,
  ContentTableView,
  ContentListModals,
} from "@/features/content-management"
import { useActiveSeed } from "@/features/schema"
import type { ConditionalFormatRule } from "@/lib/conditional-format"

export function ContentListPage() {
  const { slug } = useParams<{ slug: string; id?: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { can } = usePermissions()
  const [searchParams] = useSearchParams()
  const requestedView = searchParams.get("view")

  // Fetch the seed reactively
  const { seed, isLoading: isSeedLoading } = useActiveSeed(slug)

  // 1. Modals & Actions Hook
  const modals = useContentListModals(slug)

  // 2. Query, Filtering, Sorting & Pagination Hook
  const query = useContentListQuery(slug, seed)

  // 3. Views, Overlays & Kanban Config
  const [activeViewId, setActiveViewId] = React.useState("table")
  const kanbanSync = useKanbanEntrySync(seed ?? undefined, slug ?? "")
  const kanbanCompat = React.useMemo(() => (seed ? resolveKanbanConfig(seed) : null), [seed])
  const {
    kanbanConfig,
    setKanbanConfig,
    cardConfig,
    setCardConfig,
    isSaving: isKanbanConfigSaving,
  } = useKanbanViewConfig(slug ?? "")

  const kanbanCandidates = kanbanCompat?.compatible ? kanbanCompat.candidates : []
  const kanbanAxisBranch = React.useMemo(
    () => seed?.branches.find((b) => b.id === kanbanConfig?.axisBranchId),
    [seed, kanbanConfig?.axisBranchId]
  )

  // TODO: load and save view configuration at the user level (when a user preferences system exists).
  const authorizedViews = React.useMemo<DashboardView[]>(
    () => (seed ? resolveAuthorizedViews(seed) : ["table"]),
    [seed]
  )

  // Per-view mutable overlays (conditional formats, label overrides) — in-memory only.
  const [viewOverlays, setViewOverlays] = React.useState<
    Record<string, { conditionalFormats?: ConditionalFormatRule[]; label?: string }>
  >({})

  const views = React.useMemo<UserViewInstance[]>(
    () =>
      authorizedViews.map((type) => {
        const def = viewRegistry.get(type)
        const overlay = viewOverlays[type] ?? {}
        return {
          id: type,
          label: overlay.label ?? type,
          type,
          enabledTools: def?.enabledTools ?? ["filter", "search", "create"],
          conditionalFormats: overlay.conditionalFormats ?? [],
        }
      }),
    [authorizedViews, viewOverlays]
  )

  React.useEffect(() => {
    if (!seed) return
    const target = requestedView && isViewAuthorized(seed, requestedView) ? requestedView : "table"
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

  const handleRenameView = React.useCallback(
    (viewId: string, label: string) => {
      setViewOverlays((prev) => ({ ...prev, [viewId]: { ...prev[viewId], label } }))
    },
    []
  )

  // 4. Table Configuration Hook
  const tableConfig = useContentTableConfig({
    seed,
    data: query.data,
    pageSize: query.pageSize,
    activeView,
    selectedIds: modals.selectedIds,
    handleEdit: modals.handleEdit,
    handleDelete: modals.handleDelete,
    handleBulkDelete: modals.handleBulkDelete,
    handleBulkEdit: modals.handleBulkEdit,
    t,
  })

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
                      {query.error || `Seed "${slug}" not found`}
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
                <div className="mb-6 flex items-start justify-between">
                  {/* TODO: Extract this header to a dedicated slice component */}
                  <div>
                    <h1 className="font-heading text-2xl font-semibold">{seed.labelPlural ?? seed.label}</h1>
                    <p className="text-muted-foreground text-sm">
                      Manage "{seed.slug}" content
                    </p>
                  </div>
                  {seed.softDelete === true && (
                    <Button variant="outline" size="sm" onClick={() => navigate(`/content/${slug}/trash`)}>
                      <Trash2 className="size-4" />
                      {t("content.trash.open")}
                    </Button>
                  )}
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
                  onCreate={modals.handleCreate}
                  searchValue={query.tableSearch}
                  onSearchChange={query.setTableSearch}
                  sortState={{
                    columnId: query.singleSort?.id ?? null,
                    desc: query.singleSort?.desc ?? true,
                  }}
                  onSortChange={query.handleToolbarSortChange}
                  filters={query.toolbarFilters}
                  onFiltersChange={query.setToolbarFilters}
                  availableTagsByColumnId={query.availableTagsByColumnId}
                  availableStatusOptions={query.effectiveStatusOptions}
                  pageSize={query.pageSize}
                  onPageSizeChange={query.handlePageSizeChange}
                  columnVisibility={tableConfig.columnVisibility}
                  onColumnVisibilityChange={tableConfig.setColumnVisibility}
                  groupBy={tableConfig.groupBy}
                  onGroupByChange={tableConfig.setGroupBy}
                  dateGroupPrecision={tableConfig.dateGroupPrecision}
                  onDateGroupPrecisionChange={tableConfig.setDateGroupPrecision}
                  onOpenAutomation={() => modals.setAutomationPanelOpen(true)}
                  isAutomationActive={modals.automationPanelOpen}
                  density={tableConfig.density}
                  onDensityChange={tableConfig.setDensity}
                  kanbanCandidates={kanbanCandidates}
                  kanbanConfig={kanbanConfig}
                  onKanbanConfigChange={setKanbanConfig}
                  kanbanAxisBranch={kanbanAxisBranch}
                  onOpenCardConfig={() => modals.setCardConfigOpen(true)}
                >
                  {query.error && (
                    <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                      <p className="text-sm text-destructive">{query.error}</p>
                    </div>
                  )}
                  {query.isLoading && !query.error && (
                    activeViewId === "table" && (
                      <div className="flex items-center justify-center py-12">
                        <div className="text-muted-foreground">Loading...</div>
                      </div>
                    )
                  )}
                  {!query.isLoading && !query.error && activeViewId === "table" && (
                    <ContentTableView
                      seed={seed}
                      slug={slug!}
                      data={query.data}
                      columns={tableConfig.columns}
                      tableKey={tableConfig.tableKey}
                      initialHiddenColumns={tableConfig.initialHiddenColumns}
                      columnVisibility={tableConfig.columnVisibility}
                      onColumnVisibilityChange={tableConfig.setColumnVisibility}
                      columnSizing={tableConfig.columnSizing}
                      onColumnSizingChange={tableConfig.setColumnSizing}
                      density={tableConfig.density}
                      getRowStyles={tableConfig.getRowStyles}
                      rowSelection={modals.rowSelection}
                      onRowSelectionChange={modals.setRowSelection}
                      grouping={tableConfig.grouping}
                      onGroupingChange={tableConfig.handleGroupingChange}
                      pageSize={query.pageSize}
                      onPageSizeChange={query.handlePageSizeChange}
                      pageIndex={query.pageIndex}
                      onPageIndexChange={query.setPageIndex}
                      pageCount={query.pageCount}
                      totalRows={query.totalRows}
                      tableSearch={query.tableSearch}
                      onSearchChange={query.setTableSearch}
                      sorting={query.sorting}
                      onSortingChange={query.handleTableSortingChange}
                      columnFilters={query.columnFilters}
                      isEmptySeed={query.isEmptySeed}
                      selectedIds={modals.selectedIds}
                      can={can}
                      onEdit={modals.handleEdit}
                      onDelete={modals.handleDelete}
                      onBulkDelete={modals.handleBulkDelete}
                      onCreate={modals.handleCreate}
                      onCellActivate={query.applyCellFilter}
                    />
                  )}
                  {!query.error && activeViewId === "gallery" && (
                    <ContentGallery
                      seed={seed}
                      data={query.data}
                      isLoading={query.isLoading}
                      onEdit={modals.handleEdit}
                    />
                  )}
                  {!query.error && activeViewId === "kanban" && slug && seed && (
                    <ContentKanban
                      seed={seed}
                      seedSlug={slug}
                      isLoading={query.isLoading}
                      onEdit={modals.handleEdit}
                      onCreateEntry={modals.handleCreate}
                      search={query.debouncedSearch.trim() || undefined}
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

      <ContentListModals
        seed={seed}
        slug={slug}
        activeViewId={activeViewId}
        cardConfigOpen={modals.cardConfigOpen}
        onCloseCardConfig={() => modals.setCardConfigOpen(false)}
        cardConfig={cardConfig}
        onSaveCardConfig={setCardConfig}
        deleteDialogOpen={modals.deleteDialogOpen}
        onOpenChangeDelete={modals.setDeleteDialogOpen}
        entryIdsToDelete={modals.entryIdsToDelete}
        onConfirmDelete={modals.handleConfirmDelete}
        bulkEditOpen={modals.bulkEditOpen}
        onOpenChangeBulkEdit={(open) => {
          modals.setBulkEditOpen(open)
          if (!open) modals.setRowSelection({})
        }}
        selectedIds={modals.selectedIds}
        automationPanelOpen={modals.automationPanelOpen}
        onOpenChangeAutomation={modals.setAutomationPanelOpen}
        target={modals.target}
        dialogOpen={modals.dialogOpen}
        onCloseEntryEditor={modals.handleDialogClose}
        createDefaults={modals.createDefaults}
        readonly={!can("content:update", modals.target?.schemaSlug ?? "")}
        onSaved={(info) => {
          if (activeViewId === "kanban") kanbanSync(info)
        }}
      />
    </div>
  )
}
