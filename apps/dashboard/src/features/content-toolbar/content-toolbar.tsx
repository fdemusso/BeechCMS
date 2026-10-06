// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Flash as Zap } from 'reicon-react'

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { FilterColumnMenu } from "./toolbar-components/filter-column-menu"
import { SortColumnMenu } from "./toolbar-components/sort-column-menu"
import { FilterPillsBar } from "./toolbar-components/filter-pills-bar"
import { ViewSwitcher } from "./toolbar-components/view-switcher"
import { ToolbarStrip } from "./toolbar-components/toolbar-strip"
import { NewEntryButton } from "./toolbar-components/new-entry-button"
import { SearchBar } from "./toolbar-components/search-bar"
import { SettingsMenu } from "./toolbar-components/settings-menu"
import { TransferMenu } from "./toolbar-components/transfer-menu"

import { useContentToolbar } from "./use-content-toolbar"
import type { ContentToolbarProps } from "./types"

import { usePermissions } from "@/features/shared/hooks/use-permissions"

const FILTER_BANNER_DISMISSED_KEY = "beechcms.filterBannerDismissed"

// Per-viewer convenience: storage can be blocked or throw, so the banner just falls back to showing.
function readFilterBannerDismissed(): boolean {
  try {
    return localStorage.getItem(FILTER_BANNER_DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

function writeFilterBannerDismissed() {
  try {
    localStorage.setItem(FILTER_BANNER_DISMISSED_KEY, "1")
  } catch {
    // Ignored: the dismissal then only lasts for this mount.
  }
}

export function ContentToolbar(props: Readonly<ContentToolbarProps>) {
  const { seed, views, children, filters = {}, availableTagsByColumnId = {}, onExport, onOpenImport, isExportPending } = props
  const { t } = useTranslation()
  const toolbarState = useContentToolbar(props)
  const [isFilterBannerDismissed, setIsFilterBannerDismissed] = useState(readFilterBannerDismissed)
  // Shown only after the user adds a filter from the UI, never for filters loaded with the view.
  const [isFilterBannerOpen, setIsFilterBannerOpen] = useState(false)
  
  const { can } = usePermissions()
  const canCreate = can("content:create", seed?.slug ?? "")

  const {
    activeViewId,
    onChangeView,
    onCreateView,
    creatableViewTypes,
    onReorderViews,
    onRenameView,
    onDeleteView,
    canDeleteView,
    onCreate,
    onOpenAutomation,
    onOpenFilters,
    onOpenSort,
    onOpenSettings,
    sortState,
    onSortChange: _2,
    onConditionalFormatsChange,
    columnVisibility,
    onColumnVisibilityChange,
    pageSize,
    onPageSizeChange,
    groupBy,
    onGroupByChange,
    density,
    onDensityChange,
    renderSettingsSection,
    onOpenCardConfig,
  } = props

  const {
    activeView,
    enabledTools: _enabledTools,
    isFilterActiveEffective,
    isSortActiveEffective,
    isAutomationActiveEffective,
    isSettingsMenuOpenEffective,
    closeSettingsMenu,
    isToolEnabled,

    // Search
    isSearchOpen,
    searchInputRef,
    handleSearchOpen,
    handleSearchClose,
    handleSearchSubmit,
    handleSearchBlur,

    // Menus State
    sortColumnSearchTerm,
    setSortColumnSearchTerm,
    filterColumnSearchTerm,
    setFilterColumnSearchTerm,
    columnSearchTerm,
    setColumnSearchTerm,
    filterMenuOpen,
    setFilterMenuOpen,
    openPillId,
    setOpenPillId,
    setIsSettingsMenuOpenState,

    // View Name
    viewNameDraft,
    setViewNameDraft,
    commitViewName,

    // Sort
    filteredSortableColumns,
    handleToggleSortDirection,
    handleSortColumnSelect,

    // Filters
    addConditionToColumn,
    removeColumnFilters,
    clearAllFilters,
    updateCondition,
    removeCondition,
    visibleFilterColumns,
    activeFiltersCountByColumn,

    // Conditional formats
    conditionalFormats,
    activeConditionalRule,
    isConditionalEditorOpen,
    setActiveConditionalRuleId,
    setIsConditionalEditorOpen,
    addConditionalFormatRule,
    updateConditionalRule,
    updateConditionalTextStyles,
    removeConditionalRule,
    moveConditionalRule,
    updateConditionalCondition,
    addConditionalCondition,
    removeConditionalCondition,

    // Columns
    filteredTableColumns,
    formattableColumns,

    // Group By
    recommendedGroupColumns,
    otherGroupColumns,
    datePrecisionMode,
    applyDatePrecisionMode,
  } = toolbarState

  const hasAnyFilter = Object.keys(filters).length > 0
  useEffect(() => {
    if (!hasAnyFilter) setIsFilterBannerOpen(false)
  }, [hasAnyFilter])

  if (!activeView) {
    return null
  }

  const addConditionFromUi = (columnId: string) => {
    addConditionToColumn(columnId)
    if (!isFilterBannerDismissed) setIsFilterBannerOpen(true)
  }
  const dismissFilterBanner = () => {
    writeFilterBannerDismissed()
    setIsFilterBannerDismissed(true)
    setIsFilterBannerOpen(false)
  }

  const hasFilters = Object.keys(filters).length > 0

  return (
    <div data-seed-slug={seed.slug}>
      <ToolbarStrip>
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* Lato sinistro: viste utente + icona + */}
          <ViewSwitcher
            views={views}
            activeViewId={activeViewId}
            onChangeView={onChangeView}
            onCreateView={onCreateView}
            creatableViewTypes={creatableViewTypes}
            onReorderViews={onReorderViews}
            onDeleteView={onDeleteView}
          />

          {/* Lato destro: strumenti */}
          <div className="flex shrink-0 items-center gap-2">
            {isToolEnabled("filter") && (
              <FilterColumnMenu
                open={filterMenuOpen}
                onOpenChange={setFilterMenuOpen}
                isActive={isFilterActiveEffective}
                onOpen={onOpenFilters}
                searchTerm={filterColumnSearchTerm}
                onSearchTermChange={setFilterColumnSearchTerm}
                visibleFilterColumns={visibleFilterColumns}
                activeFiltersCountByColumn={activeFiltersCountByColumn}
                onSelectColumn={(columnId: string) => {
                  addConditionFromUi(columnId)
                  setFilterMenuOpen(false)
                  setFilterColumnSearchTerm("")
                  setOpenPillId(columnId)
                }}
              />
            )}
            {isToolEnabled("sort") && (
              <SortColumnMenu
                searchTerm={sortColumnSearchTerm}
                onSearchTermChange={setSortColumnSearchTerm}
                filteredSortableColumns={filteredSortableColumns}
                sortState={sortState}
                onToggleDirection={handleToggleSortDirection}
                onSelectColumn={handleSortColumnSelect}
                isActive={isSortActiveEffective}
                onOpen={onOpenSort}
              />
            )}
            {isToolEnabled("automation") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isAutomationActiveEffective ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label={t("toolbar.automation")}
                    onClick={() => onOpenAutomation?.()}
                  >
                    <Zap className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("toolbar.automation")}</TooltipContent>
              </Tooltip>
            )}

            {isToolEnabled("search") && (
              <SearchBar
                isSearchOpen={isSearchOpen}
                searchValue={props.searchValue ?? ""}
                searchInputRef={searchInputRef}
                handleSearchSubmit={handleSearchSubmit}
                onSearchChange={props.onSearchChange}
                handleSearchBlur={handleSearchBlur}
                handleSearchClose={handleSearchClose}
                handleSearchOpen={handleSearchOpen}
              />
            )}

            {isToolEnabled("transfer") && (
              <TransferMenu
                seed={seed}
                onExport={onExport}
                onOpenImport={onOpenImport}
                isExportPending={isExportPending}
              />
            )}

            {isToolEnabled("settings") && (
              <SettingsMenu
                isSettingsMenuOpenEffective={isSettingsMenuOpenEffective}
                setIsSettingsMenuOpenState={setIsSettingsMenuOpenState}
                onOpenSettings={onOpenSettings}
                isSettingsOpen={props.isSettingsOpen}
                commitViewName={commitViewName}
                setColumnSearchTerm={setColumnSearchTerm}
                viewNameDraft={viewNameDraft}
                setViewNameDraft={setViewNameDraft}
                setIsConditionalEditorOpen={setIsConditionalEditorOpen}
                filterColumnSearchTerm={filterColumnSearchTerm}
                setFilterColumnSearchTerm={setFilterColumnSearchTerm}
                visibleFilterColumns={visibleFilterColumns}
                addConditionToColumn={addConditionFromUi}
                setOpenPillId={setOpenPillId}
                closeSettingsMenu={closeSettingsMenu}
                filters={filters}
                sortColumnSearchTerm={sortColumnSearchTerm}
                setSortColumnSearchTerm={setSortColumnSearchTerm}
                handleToggleSortDirection={handleToggleSortDirection}
                sortState={sortState}
                filteredSortableColumns={filteredSortableColumns}
                handleSortColumnSelect={handleSortColumnSelect}
                groupBy={groupBy ?? null}
                onGroupByChange={onGroupByChange}
                recommendedGroupColumns={recommendedGroupColumns}
                datePrecisionMode={datePrecisionMode}
                applyDatePrecisionMode={applyDatePrecisionMode}
                otherGroupColumns={otherGroupColumns}
                onConditionalFormatsChange={onConditionalFormatsChange}
                formattableColumns={formattableColumns}
                conditionalFormats={conditionalFormats}
                activeConditionalRule={activeConditionalRule}
                isConditionalEditorOpen={isConditionalEditorOpen}
                setActiveConditionalRuleId={setActiveConditionalRuleId}
                addConditionalFormatRule={addConditionalFormatRule}
                updateConditionalRule={updateConditionalRule}
                updateConditionalTextStyles={updateConditionalTextStyles}
                removeConditionalRule={removeConditionalRule}
                moveConditionalRule={moveConditionalRule}
                updateConditionalCondition={updateConditionalCondition}
                addConditionalCondition={addConditionalCondition}
                removeConditionalCondition={removeConditionalCondition}
                availableTagsByColumnId={availableTagsByColumnId}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={onColumnVisibilityChange}
                columnSearchTerm={columnSearchTerm}
                filteredTableColumns={filteredTableColumns}
                pageSize={pageSize}
                onPageSizeChange={onPageSizeChange}
                density={density}
                onDensityChange={onDensityChange}
                settings={activeView.settings}
                showSort={isToolEnabled("sort")}
                renderSettingsSection={renderSettingsSection}
                onOpenCardConfig={onOpenCardConfig}
                isViewNameEditable={Boolean(onRenameView)}
                onDeleteView={onDeleteView ? () => onDeleteView(activeView.id) : undefined}
                canDeleteView={canDeleteView ?? false}
              />
            )}

            {isToolEnabled("create") && (
              <NewEntryButton canCreate={canCreate} onCreate={onCreate} seedLabel={seed.labelPlural ?? seed.label} />
            )}
          </div>
        </div>

        {hasFilters && (
          <div className="mt-3 pt-3 border-t">
            <FilterPillsBar
              filters={filters}
              openPillId={openPillId}
              onOpenPillChange={setOpenPillId}
              addConditionToColumn={addConditionFromUi}
              removeColumnFilters={removeColumnFilters}
              updateCondition={updateCondition}
              removeCondition={removeCondition}
              availableTagsByColumnId={availableTagsByColumnId}
            >
              {isFilterBannerOpen && !isFilterBannerDismissed && (
                <div className="flex h-8 min-w-64 flex-1 items-center justify-between gap-3 rounded-full bg-amber-50 px-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  <span className="min-w-0 truncate">{t("toolbar.filterBanner.message")}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-6 shrink-0 px-1 text-xs text-amber-800 underline hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
                      onClick={clearAllFilters}
                    >
                      {t("toolbar.filterBanner.clearAll")}
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-6 shrink-0 px-1 text-xs text-amber-800 underline hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-100"
                      onClick={dismissFilterBanner}
                    >
                      {t("toolbar.filterBanner.dismiss")}
                    </Button>
                  </div>
                </div>
              )}
            </FilterPillsBar>
          </div>
        )}
      </ToolbarStrip>

      {/* Contenuto scrollabile (tabella, galleria, errori) */}
      {children != null && (
        <div className="mt-4" data-slot="view-viewport">
          {children}
        </div>
      )}
    </div>
  )
}
