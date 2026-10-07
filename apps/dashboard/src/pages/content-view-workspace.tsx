// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import type { ContentView, DashboardView, Seed, TransferFormat } from "@beechcms/core"
import type { ViewEntryActions, ViewEntrySavedInfo } from "@/features/shared"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { ContentToolbar, type UserViewInstance } from "@/features/content-toolbar"
import { useContentListQuery, useContentListModals, ContentListModals } from "@/features/content-management"
import { toContentViewConfig, toViewToolbarState, useViewConfigAutosave, useViewLayoutState } from "@/features/content-views"
import { FOLDER_PARAM, folderCreateDefaults } from "@/features/content-gallery"
import { downloadExport, readProblem } from "@/features/content-transfer"
import { compileElementFormatter, type ConditionalFormatRule } from "@/lib/conditional-format"
import { viewRegistry } from "./view-registry"

export interface ContentViewWorkspaceProps {
  seed: Seed
  slug: string
  /** The active instance. Read once, at mount. */
  view: ContentView
  /** Every visible instance, labelled, in tab order. */
  switcherViews: UserViewInstance[]
  creatableViewTypes: readonly DashboardView[]
  /** content:update on this seed: autosave and view management. */
  canManageViews: boolean
  canDeleteView: boolean
  onChangeView: (viewId: string) => void
  onCreateView?: (type: DashboardView) => void
  onRenameView?: (viewId: string, label: string) => void
  onDeleteView?: (viewId: string) => void
  /** Present only for users who may reorder views. */
  onReorderViews?: (orderedIds: string[]) => void
}

export function ContentViewWorkspace({ seed, slug, view, switcherViews, creatableViewTypes, canManageViews, canDeleteView, onChangeView, onCreateView, onRenameView, onDeleteView, onReorderViews }: ContentViewWorkspaceProps) {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const [initial] = React.useState(() => toViewToolbarState(view.config, seed))

  const modals = useContentListModals(slug)

  const [isExportPending, setIsExportPending] = React.useState(false)
  const handleExport = React.useCallback(
    async (format: TransferFormat) => {
      if (!slug) return
      setIsExportPending(true)
      try {
        await downloadExport(slug, format)
      } catch (error) {
        const problem = await readProblem(error)
        toast.error(problem?.detail ?? t("transfer.export.errors.unknown"))
      } finally {
        setIsExportPending(false)
      }
    },
    [slug, t],
  )

  const query = useContentListQuery(slug, seed, { filters: initial.filters, sort: initial.sort, pageSize: initial.pageSize })
  const layout = useViewLayoutState(initial, seed)

  const config = React.useMemo(
    () =>
      toContentViewConfig(
        {
          filters: query.persistableFilters,
          sort: query.singleSort ? { id: query.singleSort.id, desc: query.singleSort.desc } : null,
          groupBy: layout.groupBy,
          dateGroupPrecision: layout.dateGroupPrecision,
          columnVisibility: layout.columnVisibility,
          density: layout.density,
          pageSize: query.pageSize,
          conditionalFormats: layout.conditionalFormats,
          kanban: layout.kanban,
          card: layout.card,
          folders: layout.folders,
        },
        seed,
        view.type
      ),
    [query.persistableFilters, query.singleSort, query.pageSize, layout.groupBy, layout.dateGroupPrecision,
     layout.columnVisibility, layout.density, layout.conditionalFormats, layout.kanban, layout.card, layout.folders, seed, view.type]
  )
  const { isSaving } = useViewConfigAutosave({ slug, viewId: view.id, config, enabled: canManageViews })

  const toolbarViews = React.useMemo(
    () => switcherViews.map((v) => (v.id === view.id ? { ...v, conditionalFormats: layout.conditionalFormats } : v)),
    [switcherViews, view.id, layout.conditionalFormats]
  )
  const handleConditionalFormatsChange = React.useCallback(
    (_viewId: string, next: ConditionalFormatRule[]) => layout.setConditionalFormats(next),
    [layout.setConditionalFormats]
  )
  const formatElement = React.useMemo(
    () => compileElementFormatter(layout.conditionalFormats),
    [layout.conditionalFormats]
  )

  const definition = viewRegistry.get(view.type)

  // Gallery con cartella aperta: "Nuovo" precompila il campo "Raggruppa per" con il valore della cartella.
  const [searchParams] = useSearchParams()
  const folderParam = searchParams.get(FOLDER_PARAM)
  const handleToolbarCreate = React.useCallback(() => {
    const defaults =
      view.type === "gallery" ? folderCreateDefaults(seed, query.data, layout.groupBy, folderParam) : undefined
    modals.handleCreate(defaults)
  }, [view.type, seed, query.data, layout.groupBy, folderParam, modals.handleCreate])
  const [configDialogOpen, setConfigDialogOpen] = React.useState(false)

  const savedListenersRef = React.useRef(new Set<(info: ViewEntrySavedInfo) => void>())
  const subscribeSaved = React.useCallback((listener: (info: ViewEntrySavedInfo) => void) => {
    savedListenersRef.current.add(listener)
    return () => { savedListenersRef.current.delete(listener) }
  }, [])
  const handleSaved = React.useCallback((info: ViewEntrySavedInfo) => {
    for (const listener of savedListenersRef.current) listener(info)
  }, [])

  const entries = React.useMemo<ViewEntryActions>(
    () => ({
      handleEdit: modals.handleEdit,
      handleCreate: modals.handleCreate,
      handleDelete: modals.handleDelete,
      handleBulkDelete: modals.handleBulkDelete,
      handleBulkEdit: modals.handleBulkEdit,
      rowSelection: modals.rowSelection,
      setRowSelection: modals.setRowSelection,
      selectedIds: modals.selectedIds,
      subscribeSaved,
    }),
    [modals.handleEdit, modals.handleCreate, modals.handleDelete, modals.handleBulkDelete, modals.handleBulkEdit,
     modals.rowSelection, modals.setRowSelection, modals.selectedIds, subscribeSaved]
  )

  const SettingsSection = definition?.SettingsSection
  const renderSettingsSection = SettingsSection
    ? ({ close }: { close: () => void }) => (
        <SettingsSection seed={seed} layout={layout} onClose={close} onOpenConfigDialog={() => setConfigDialogOpen(true)} />
      )
    : undefined

  return (
    <>
      <ContentToolbar
        seed={seed}
        views={toolbarViews}
        activeViewId={view.id}
        onChangeView={onChangeView}
        onCreateView={onCreateView}
        creatableViewTypes={creatableViewTypes}
        onReorderViews={onReorderViews}
        onRenameView={onRenameView}
        onDeleteView={onDeleteView}
        canDeleteView={canDeleteView}
        onConditionalFormatsChange={handleConditionalFormatsChange}
        onCreate={handleToolbarCreate}
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
        columnVisibility={layout.columnVisibility}
        onColumnVisibilityChange={layout.setColumnVisibility}
        groupBy={layout.groupBy}
        onGroupByChange={layout.setGroupBy}
        dateGroupPrecision={layout.dateGroupPrecision}
        onDateGroupPrecisionChange={layout.setDateGroupPrecision}
        onOpenAutomation={() => modals.setAutomationPanelOpen(true)}
        isAutomationActive={modals.automationPanelOpen}
        density={layout.density}
        onDensityChange={layout.setDensity}
        renderSettingsSection={renderSettingsSection}
        onOpenCardConfig={() => setConfigDialogOpen(true)}
        onExport={handleExport}
        onOpenImport={() => modals.setImportWizardOpen(true)}
        isExportPending={isExportPending}
      >
        {query.error ? (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{query.error}</p>
          </div>
        ) : definition ? (
          <definition.Renderer
            seed={seed}
            slug={slug}
            query={query}
            layout={layout}
            formatElement={formatElement}
            entries={entries}
            isSaving={isSaving}
            configDialog={{ open: configDialogOpen, onOpenChange: setConfigDialogOpen }}
          />
        ) : (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{t("content.views.errors.loadFailed")}</p>
          </div>
        )}
      </ContentToolbar>

      <ContentListModals
        seed={seed}
        slug={slug}
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
        onSaved={handleSaved}
        importWizardOpen={modals.importWizardOpen}
        onOpenChangeImportWizard={modals.setImportWizardOpen}
      />
    </>
  )
}
