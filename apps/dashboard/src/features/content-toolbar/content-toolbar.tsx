// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Zap, Plus } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { FilterColumnMenu } from "./toolbar-components/filter-column-menu"
import { SortColumnMenu } from "./toolbar-components/sort-column-menu"
import { FilterPillsBar } from "./toolbar-components/filter-pills-bar"
import { ViewSwitcher } from "./toolbar-components/view-switcher"
import { SearchBar } from "./toolbar-components/search-bar"
import { SettingsMenu } from "./toolbar-components/settings-menu"

import { useContentToolbar } from "./use-content-toolbar"
import type { ContentToolbarProps } from "./types"

export function ContentToolbar(props: Readonly<ContentToolbarProps>) {
  const { seed, views, children, filters = {}, availableTagsByColumnId = {} } = props
  const { t } = useTranslation()
  const toolbarState = useContentToolbar(props)

  const {
    activeViewId,
    onChangeView,
    onCreateView,
    onRenameView: _,
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
    activeGroupLabel,
    datePrecisionMode,
    applyDatePrecisionMode,
  } = toolbarState

  if (!activeView) {
    return null
  }

  const hasFiltersOrGroup = Object.keys(filters).length > 0 || !!activeGroupLabel

  return (
    <div data-seed-slug={seed.slug}>
      {/* Sticky toolbar strip — si posiziona appena sotto il SiteHeader (--header-height). */}
      <div className="sticky top-(--header-height) z-10 bg-background/95 backdrop-blur-sm">
        <Card className="py-3 border-0 ring-0 bg-transparent shadow-none rounded-none">
          <CardContent className="px-4 py-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              {/* Lato sinistro: viste utente + icona + */}
              <ViewSwitcher
                views={views}
                activeViewId={activeViewId}
                onChangeView={onChangeView}
                onCreateView={onCreateView}
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
                      addConditionToColumn(columnId)
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
                    addConditionToColumn={addConditionToColumn}
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
                  />
                )}

                {isToolEnabled("create") && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onCreate}
                    className="gap-1.5"
                  >
                    <Plus className="size-4" />
                    {t("siteHeader.new")}
                  </Button>
                )}
              </div>
            </div>

            {hasFiltersOrGroup && (
              <div className="mt-3 pt-3 border-t">
                <FilterPillsBar
                  filters={filters}
                  openPillId={openPillId}
                  onOpenPillChange={setOpenPillId}
                  groupBy={groupBy ?? null}
                  activeGroupLabel={activeGroupLabel ?? ""}
                  onGroupByChange={onGroupByChange}
                  addConditionToColumn={addConditionToColumn}
                  removeColumnFilters={removeColumnFilters}
                  updateCondition={updateCondition}
                  removeCondition={removeCondition}
                  availableTagsByColumnId={availableTagsByColumnId}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contenuto scrollabile (tabella, galleria, errori) */}
      {children != null && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  )
}
