// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Settings, Filter, Grid as LayoutGrid, SortV as ArrowUpDown, RowVertical as Rows3, Eye, EyeOff, RowVertical as Rows2, AlignLeft as AlignJustify, Minus, Plus, Trash2 } from '@/components/icons'

import type { VisibilityState } from "@tanstack/react-table"
import type { TableDensity } from "@/lib/density"
import type { ConditionalFormatRule } from "@/lib/conditional-format"
import type { ViewSetting } from "@/features/shared"
import { ConditionalColorsSubmenu, ConditionalRuleDialog } from "./conditional-formats-editor"
import type { DatePrecisionMode } from "../toolbar-hooks/use-toolbar-groupby"

interface SettingsMenuProps {
  readonly isSettingsMenuOpenEffective: boolean
  readonly setIsSettingsMenuOpenState: (open: boolean) => void
  readonly onOpenSettings?: () => void
  readonly isSettingsOpen?: boolean
  readonly commitViewName: () => void
  readonly setColumnSearchTerm: (term: string) => void
  readonly viewNameDraft: string
  readonly setViewNameDraft: (name: string) => void
  readonly setIsConditionalEditorOpen: (open: boolean) => void
  readonly filterColumnSearchTerm: string
  readonly setFilterColumnSearchTerm: (term: string) => void
  readonly visibleFilterColumns: any[]
  readonly addConditionToColumn: (columnId: string) => void
  readonly setOpenPillId: (id: string | null) => void
  readonly closeSettingsMenu: () => void
  readonly filters: Record<string, any>
  readonly sortColumnSearchTerm: string
  readonly setSortColumnSearchTerm: (term: string) => void
  readonly handleToggleSortDirection: () => void
  readonly sortState?: { columnId: string | null; desc: boolean }
  readonly filteredSortableColumns: any[]
  readonly handleSortColumnSelect: (alias: string) => void
  readonly groupBy: string | null
  readonly onGroupByChange?: (columnId: string | null) => void
  readonly recommendedGroupColumns: any[]
  readonly datePrecisionMode: DatePrecisionMode
  readonly applyDatePrecisionMode: (mode: DatePrecisionMode) => void
  readonly otherGroupColumns: any[]
  readonly onConditionalFormatsChange?: (viewId: string, next: ConditionalFormatRule[]) => void
  readonly formattableColumns: any[]
  readonly conditionalFormats: any[]
  readonly activeConditionalRule: any
  readonly isConditionalEditorOpen: boolean
  readonly setActiveConditionalRuleId: (id: string | null) => void
  readonly addConditionalFormatRule: (columnId: string) => void
  readonly updateConditionalRule: (id: string, updates: any) => void
  readonly updateConditionalTextStyles: (id: string, updates: any) => void
  readonly removeConditionalRule: (id: string) => void
  readonly moveConditionalRule: (id: string, direction: 1 | -1) => void
  readonly updateConditionalCondition: (ruleId: string, conditionId: string, updates: any) => void
  readonly addConditionalCondition: (ruleId: string, columnId?: string) => void
  readonly removeConditionalCondition: (ruleId: string, conditionId: string) => void
  readonly availableTagsByColumnId: Record<string, string[]>
  readonly columnVisibility?: VisibilityState
  readonly onColumnVisibilityChange?: (visibility: VisibilityState) => void
  readonly columnSearchTerm: string
  readonly filteredTableColumns: any[]
  readonly pageSize?: number
  readonly onPageSizeChange?: (size: number) => void
  readonly density?: TableDensity
  readonly onDensityChange?: (density: TableDensity) => void
  readonly settings: readonly ViewSetting[]
  readonly showSort: boolean
  /** The active View Type's own settings block; `close` closes the settings menu. */
  readonly renderSettingsSection?: (ctx: { close: () => void }) => React.ReactNode
  readonly onOpenCardConfig?: () => void
  readonly isViewNameEditable?: boolean
  readonly onDeleteView?: () => void
  readonly canDeleteView?: boolean
}

const NO_GROUPING = "__none__"

export function SettingsMenu({
  isSettingsMenuOpenEffective,
  setIsSettingsMenuOpenState,
  onOpenSettings,
  isSettingsOpen,
  commitViewName,
  setColumnSearchTerm,
  viewNameDraft,
  setViewNameDraft,
  setIsConditionalEditorOpen,
  filterColumnSearchTerm,
  setFilterColumnSearchTerm,
  visibleFilterColumns,
  addConditionToColumn,
  setOpenPillId,
  closeSettingsMenu,
  filters,
  sortColumnSearchTerm,
  setSortColumnSearchTerm,
  handleToggleSortDirection,
  sortState,
  filteredSortableColumns,
  handleSortColumnSelect,
  groupBy,
  onGroupByChange,
  recommendedGroupColumns,
  datePrecisionMode,
  applyDatePrecisionMode,
  otherGroupColumns,
  onConditionalFormatsChange,
  formattableColumns,
  conditionalFormats,
  activeConditionalRule,
  isConditionalEditorOpen,
  setActiveConditionalRuleId,
  addConditionalFormatRule,
  updateConditionalRule,
  updateConditionalTextStyles,
  removeConditionalRule,
  moveConditionalRule,
  updateConditionalCondition,
  addConditionalCondition,
  removeConditionalCondition,
  availableTagsByColumnId,
  columnVisibility,
  onColumnVisibilityChange,
  columnSearchTerm,
  filteredTableColumns,
  pageSize,
  onPageSizeChange,
  density,
  onDensityChange,
  settings,
  showSort,
  renderSettingsSection,
  onOpenCardConfig,
  isViewNameEditable,
  onDeleteView,
  canDeleteView,
}: SettingsMenuProps) {
  const { t } = useTranslation()
  const showLayoutGroup = settings.includes("groupBy") || settings.includes("conditionalFormats") || settings.includes("cardLayout")
  const showDisplayGroup = settings.includes("columns") || settings.includes("pageSize") || settings.includes("density")
  const groupByLabel =
    [...recommendedGroupColumns, ...otherGroupColumns].find((col: any) => col.columnId === groupBy)?.label ?? groupBy
  const settingsSectionNode = renderSettingsSection?.({ close: closeSettingsMenu }) ?? null
  // The display group is the only block that does not end in its own separator (quick actions,
  // the settings section and the layout group all do, or nothing rendered since the quick-actions
  // separator, which then already stands alone before delete). So delete needs its own separator
  // iff the display group rendered, regardless of what rendered before it.
  const deleteSeparatorAlreadyEmitted = !showDisplayGroup
  return (
    <>
    <DropdownMenu
      open={isSettingsMenuOpenEffective}
      onOpenChange={(open) => {
        if (!open) {
          commitViewName()
          setColumnSearchTerm("")
        }
        if (open) onOpenSettings?.()
        if (isSettingsOpen === undefined) setIsSettingsMenuOpenState(open)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isSettingsMenuOpenEffective ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={t("toolbar.settings.tooltip")}
            >
              <Settings className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("toolbar.settings.tooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        {/* Dettagli vista */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("toolbar.settings.title")}</DropdownMenuLabel>
          <div className="px-2 pb-1.5">
            <Input
              value={viewNameDraft}
              onChange={(e) => setViewNameDraft(e.target.value)}
              onBlur={() => commitViewName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitViewName()
                  return
                }
                if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                  e.stopPropagation()
                }
              }}
              className="h-8 text-sm"
              placeholder={t("toolbar.settings.viewName")}
              disabled={isViewNameEditable === false}
            />
          </div>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Azioni rapide */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("toolbar.settings.quickActions")}</DropdownMenuLabel>
          <DropdownMenuSub
            onOpenChange={(open) => {
              if (open) setIsConditionalEditorOpen(false)
            }}
          >
            <DropdownMenuSubTrigger>
              <Filter className="size-4" />
              {t("toolbar.settings.filter")}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-64 p-2">
                <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                  {t("toolbar.filter.label")}
                </DropdownMenuLabel>
                <Input
                  placeholder={t("toolbar.filter.search.placeholder")}
                  value={filterColumnSearchTerm}
                  onChange={(e) => setFilterColumnSearchTerm(e.target.value)}
                  className="h-8 text-sm"
                />
                <DropdownMenuSeparator className="my-2" />
                <ScrollArea className="max-h-56 pr-2">
                  {visibleFilterColumns.length === 0 ? (
                    <div className="py-2 text-center text-xs text-muted-foreground">
                      {t("toolbar.filter.noColumns")}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 py-1">
                      {visibleFilterColumns.map((col: any) => (
                        <Button
                          key={col.columnId}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 justify-between px-2 text-xs"
                          onClick={() => {
                            addConditionToColumn(col.columnId)
                            setFilterColumnSearchTerm("")
                            setOpenPillId(col.columnId)
                            closeSettingsMenu()
                          }}
                        >
                          <span className="truncate">{col.label}</span>
                          {filters[col.columnId]?.conditions?.length ? (
                            <span className="text-muted-foreground text-xs uppercase">
                              {filters[col.columnId].conditions.length}
                            </span>
                          ) : null}
                        </Button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          {showSort && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowUpDown className="size-4" />
                {t("toolbar.settings.sort")}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-64 p-2">
                  <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                    {t("toolbar.sort.label")}
                  </DropdownMenuLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={t("toolbar.sort.search.placeholder")}
                      value={sortColumnSearchTerm}
                      onChange={(e) => setSortColumnSearchTerm(e.target.value)}
                      className="h-8 flex-1 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="h-8 w-8 shrink-0"
                      aria-label={t("toolbar.sort.invertOrder")}
                      onClick={handleToggleSortDirection}
                      disabled={!sortState?.columnId}
                    >
                      <ArrowUpDown className="size-3.5" />
                    </Button>
                  </div>
                  <DropdownMenuSeparator className="my-2" />
                  <ScrollArea className="max-h-56 pr-2">
                    {filteredSortableColumns.length === 0 ? (
                      <div className="py-2 text-center text-xs text-muted-foreground">
                        {t("toolbar.sort.noColumns")}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 py-1">
                        {filteredSortableColumns.map((branch: any) => {
                          const isSelected = sortState?.columnId === branch.alias
                          return (
                            <Button
                              key={branch.alias}
                              type="button"
                              variant={isSelected ? "secondary" : "ghost"}
                              size="sm"
                              className="h-8 justify-between px-2 text-xs"
                              onClick={() => handleSortColumnSelect(branch.alias)}
                            >
                              <span className="truncate">{branch.label}</span>
                              {isSelected && (
                                <span className="text-muted-foreground text-xs uppercase">
                                  {sortState?.desc ? "DESC" : "ASC"}
                                </span>
                              )}
                            </Button>
                          )
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Layout e stile: one group for the universal items and the active View Type's own items. */}
        {(showLayoutGroup || settingsSectionNode) && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("toolbar.settings.layoutStyle")}</DropdownMenuLabel>
              {settingsSectionNode}
              {settings.includes("groupBy") && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Rows3 className="size-4" />
                    <span className="flex-1">{t("toolbar.settings.group")}</span>
                    {groupBy && (
                      <span className="max-w-24 truncate text-xs text-muted-foreground">
                        {groupByLabel}
                      </span>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-64">
                      <DropdownMenuLabel>{t("toolbar.settings.groupBy")}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={groupBy ?? NO_GROUPING}
                        onValueChange={(value) => {
                          onGroupByChange?.(value === NO_GROUPING ? null : value)
                          closeSettingsMenu()
                        }}
                      >
                        <DropdownMenuRadioItem value={NO_GROUPING}>
                          {t("toolbar.settings.noGrouping")}
                        </DropdownMenuRadioItem>
                        <ScrollArea className="max-h-72">
                          {recommendedGroupColumns.length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>{t("toolbar.settings.recommended")}</DropdownMenuLabel>
                              {recommendedGroupColumns.map((col: any) =>
                                col.branchType === "date" ? (
                                  <DropdownMenuSub key={col.columnId}>
                                    <DropdownMenuSubTrigger>
                                      <span className="flex-1 truncate">{col.label}</span>
                                      {groupBy === col.columnId && (
                                        <span className="text-xs text-muted-foreground">
                                          {t(`toolbar.settings.${datePrecisionMode === "monthYear" ? "month" : datePrecisionMode}`)}
                                        </span>
                                      )}
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                      <DropdownMenuSubContent className="w-48">
                                        <DropdownMenuLabel>{col.label}</DropdownMenuLabel>
                                        <DropdownMenuRadioGroup
                                          value={groupBy === col.columnId ? datePrecisionMode : ""}
                                          onValueChange={(v) => {
                                            onGroupByChange?.(col.columnId)
                                            applyDatePrecisionMode((v || "monthYear") as DatePrecisionMode)
                                            closeSettingsMenu()
                                          }}
                                        >
                                          <DropdownMenuRadioItem value="day">{t("toolbar.settings.day")}</DropdownMenuRadioItem>
                                          <DropdownMenuRadioItem value="monthYear">{t("toolbar.settings.month")}</DropdownMenuRadioItem>
                                          <DropdownMenuRadioItem value="year">{t("toolbar.settings.year")}</DropdownMenuRadioItem>
                                        </DropdownMenuRadioGroup>
                                      </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                  </DropdownMenuSub>
                                ) : (
                                  <DropdownMenuRadioItem key={col.columnId} value={col.columnId}>
                                    <span className="truncate">{col.label}</span>
                                  </DropdownMenuRadioItem>
                                )
                              )}
                            </>
                          )}
                          {otherGroupColumns.length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>{t("toolbar.settings.otherFields")}</DropdownMenuLabel>
                              <p className="px-1.5 pb-1 text-xs text-muted-foreground">
                                {t("toolbar.settings.manyGroups")}
                              </p>
                              {otherGroupColumns.map((col: any) => (
                                <DropdownMenuRadioItem key={col.columnId} value={col.columnId}>
                                  <span className="truncate">{col.label}</span>
                                </DropdownMenuRadioItem>
                              ))}
                            </>
                          )}
                        </ScrollArea>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
              {settings.includes("cardLayout") && onOpenCardConfig && (
                <DropdownMenuItem
                  onSelect={() => {
                    onOpenCardConfig()
                    closeSettingsMenu()
                  }}
                >
                  <LayoutGrid className="size-4" />
                  {t("kanban.cardConfig.openConfig", "Configure card layout")}
                </DropdownMenuItem>
              )}
              {settings.includes("conditionalFormats") && (
                <ConditionalColorsSubmenu
                  enabled={Boolean(onConditionalFormatsChange)}
                  formattableColumns={formattableColumns}
                  conditionalFormats={conditionalFormats}
                  setActiveConditionalRuleId={setActiveConditionalRuleId}
                  setIsConditionalEditorOpen={setIsConditionalEditorOpen}
                  addConditionalFormatRule={addConditionalFormatRule}
                  onClose={closeSettingsMenu}
                />
              )}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
          </>
        )}

        {showDisplayGroup && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("toolbar.settings.display")}</DropdownMenuLabel>
              {settings.includes("columns") && columnVisibility && onColumnVisibilityChange && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Eye className="size-4" />
                    {t("toolbar.settings.visibleColumns")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-64 p-2">
                      <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                        {t("toolbar.settings.columnVisibility")}
                      </DropdownMenuLabel>
                      <Input
                        placeholder={t("toolbar.settings.columnSearch")}
                        value={columnSearchTerm}
                        onChange={(e) => setColumnSearchTerm(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <DropdownMenuSeparator className="my-2" />
                      <ScrollArea className="max-h-56 pr-2">
                        {filteredTableColumns.length === 0 ? (
                          <div className="py-2 text-center text-xs text-muted-foreground">
                            {t("toolbar.settings.noColumns")}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 py-1">
                            {filteredTableColumns.map((col: any) => {
                              const isVisible = columnVisibility[col.id] ?? true
                              return (
                                <Button
                                  key={col.id}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 justify-between px-2 text-xs"
                                  onClick={() => {
                                    const nextVisibility: VisibilityState = {
                                      ...columnVisibility,
                                      [col.id]: !isVisible,
                                    }
                                    onColumnVisibilityChange(nextVisibility)
                                  }}
                                >
                                  <span className="truncate">{col.label}</span>
                                  {isVisible ? (
                                    <Eye className="size-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <EyeOff className="size-3.5 shrink-0 text-muted-foreground/50" />
                                  )}
                                </Button>
                              )
                            })}
                          </div>
                        )}
                      </ScrollArea>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
              {settings.includes("pageSize") && pageSize != null && onPageSizeChange && (
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="justify-between gap-4 focus:bg-transparent focus:text-inherit data-[highlighted]:bg-transparent data-[highlighted]:text-inherit cursor-default">
                  <div className="flex items-center gap-2">
                    <Rows2 className="size-4" />
                    {t("toolbar.settings.rows")}
                  </div>
                  <div className="flex h-7 items-stretch">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      className="h-7 w-7 rounded-r-none border-r-0"
                      aria-label={t("toolbar.settings.decreaseRows")}
                      disabled={pageSize <= 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPageSizeChange(Math.max(1, pageSize - 1))
                      }}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <div className="flex w-9 items-center justify-center border border-input bg-background text-xs tabular-nums">
                      {pageSize}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      className="h-7 w-7 rounded-l-none border-l-0"
                      aria-label={t("toolbar.settings.increaseRows")}
                      disabled={pageSize >= 100}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPageSizeChange(Math.min(100, pageSize + 1))
                      }}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </DropdownMenuItem>
              )}
              {settings.includes("density") && density != null && onDensityChange && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <AlignJustify className="size-4" />
                    {t("toolbar.settings.density")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-48 p-2">
                      <DropdownMenuRadioGroup
                        value={density}
                        onValueChange={(v) => onDensityChange(v as TableDensity)}
                      >
                        <DropdownMenuRadioItem value="compact">
                          {t("toolbar.settings.densityCompact")}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="normal">
                          {t("toolbar.settings.densityNormal")}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="comfortable">
                          {t("toolbar.settings.densityComfortable")}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
            </DropdownMenuGroup>
        )}

        {onDeleteView && (
          <>
            {!deleteSeparatorAlreadyEmitted && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant="destructive"
              className="text-status-danger-foreground focus:bg-destructive/10 focus:text-status-danger-foreground [&_svg]:text-status-danger-foreground"
              disabled={!canDeleteView}
              onSelect={() => {
                closeSettingsMenu()
                onDeleteView()
              }}
            >
              <Trash2 className="size-4" />
              {t("content.views.delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    {settings.includes("conditionalFormats") && (
      <ConditionalRuleDialog
        rule={activeConditionalRule}
        open={isConditionalEditorOpen && Boolean(activeConditionalRule)}
        onOpenChange={setIsConditionalEditorOpen}
        conditionalFormats={conditionalFormats}
        updateConditionalRule={updateConditionalRule}
        moveConditionalRule={moveConditionalRule}
        removeConditionalRule={(id) => {
          removeConditionalRule(id)
          setIsConditionalEditorOpen(false)
        }}
        updateConditionalCondition={updateConditionalCondition}
        addConditionalCondition={addConditionalCondition}
        removeConditionalCondition={removeConditionalCondition}
        updateConditionalTextStyles={updateConditionalTextStyles}
        availableTagsByColumnId={availableTagsByColumnId}
      />
    )}
    </>
  )
}
