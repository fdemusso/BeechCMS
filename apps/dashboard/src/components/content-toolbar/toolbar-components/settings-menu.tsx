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
import {
  Settings,
  Filter,
  ArrowUpDown,
  Rows3,
  Palette,
  Eye,
  EyeOff,
  Rows2,
  Minus,
  Plus,
  Check,
} from "lucide-react"

import type { VisibilityState } from "@tanstack/react-table"
import type { ConditionalFormatRule } from "@/lib/conditional-format"
import { ConditionalFormatsEditor } from "./conditional-formats-editor"
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
}

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
}: SettingsMenuProps) {
  return (
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
              aria-label="Impostazioni vista"
            >
              <Settings className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Impostazioni vista</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        {/* Dettagli vista */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Impostazioni vista</DropdownMenuLabel>
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
              placeholder="Nome vista"
            />
          </div>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Azioni rapide */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Azioni rapide</DropdownMenuLabel>
          <DropdownMenuSub
            onOpenChange={(open) => {
              if (open) setIsConditionalEditorOpen(false)
            }}
          >
            <DropdownMenuSubTrigger>
              <Filter className="size-4" />
              Filtra
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-64 p-2">
                <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                  Filtra per colonna
                </DropdownMenuLabel>
                <Input
                  placeholder="Cerca colonna..."
                  value={filterColumnSearchTerm}
                  onChange={(e) => setFilterColumnSearchTerm(e.target.value)}
                  className="h-8 text-sm"
                />
                <DropdownMenuSeparator className="my-2" />
                <div className="max-h-56 overflow-y-auto">
                  {visibleFilterColumns.length === 0 ? (
                    <div className="py-2 text-center text-xs text-muted-foreground">
                      Nessuna colonna trovata
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
                            <span className="text-muted-foreground text-[10px] uppercase">
                              {filters[col.columnId].conditions.length}
                            </span>
                          ) : null}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowUpDown className="size-4" />
              Ordina
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-64 p-2">
                <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                  Ordina per colonna
                </DropdownMenuLabel>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Cerca colonna..."
                    value={sortColumnSearchTerm}
                    onChange={(e) => setSortColumnSearchTerm(e.target.value)}
                    className="h-8 flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="h-8 w-8 shrink-0"
                    aria-label="Inverti ordine"
                    onClick={handleToggleSortDirection}
                    disabled={!sortState?.columnId}
                  >
                    <ArrowUpDown className="size-3.5" />
                  </Button>
                </div>
                <DropdownMenuSeparator className="my-2" />
                <div className="max-h-56 overflow-y-auto">
                  {filteredSortableColumns.length === 0 ? (
                    <div className="py-2 text-center text-xs text-muted-foreground">
                      Nessuna colonna trovata
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
                              <span className="text-muted-foreground text-[10px] uppercase">
                                {sortState?.desc ? "DESC" : "ASC"}
                              </span>
                            )}
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Layout e stile */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Layout e stile</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Rows3 className="size-4" />
              Raggruppa{groupBy ? "..." : ""}
              {groupBy && (
                <span className="ml-auto text-[10px] text-muted-foreground uppercase">
                  attivo
                </span>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-64 p-2">
                <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                  Raggruppa per colonna
                </DropdownMenuLabel>
                {/* Voce "Nessun raggruppamento" */}
                <Button
                  type="button"
                  variant={groupBy ? "ghost" : "secondary"}
                  size="sm"
                  className="h-8 w-full justify-between px-2 text-xs"
                  onClick={() => {
                    onGroupByChange?.(null)
                    closeSettingsMenu()
                  }}
                >
                  <span>Nessun raggruppamento</span>
                  {!groupBy && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
                </Button>
                {recommendedGroupColumns.length > 0 && (
                  <>
                    <DropdownMenuSeparator className="my-2" />
                    <DropdownMenuLabel className="px-0 pb-1 pt-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Consigliati
                    </DropdownMenuLabel>
                    <div className="flex flex-col gap-1">
                      {recommendedGroupColumns.map((col: any) =>
                        col.branchType === "date" ? (
                          <DropdownMenuSub key={col.columnId}>
                            <DropdownMenuSubTrigger
                              className="h-8 w-full rounded-sm px-2 text-xs data-[state=open]:bg-accent"
                            >
                              <span className="flex-1 truncate text-left">{col.label}</span>
                              {groupBy === col.columnId && <Check className="mr-2 size-3.5 shrink-0 text-muted-foreground" />}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                              <DropdownMenuSubContent className="w-48 p-2">
                                <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                                  Granularità
                                </DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                  value={datePrecisionMode}
                                  onValueChange={(v) => {
                                    const nextMode = (v || "monthYear") as DatePrecisionMode
                                    onGroupByChange?.(col.columnId)
                                    applyDatePrecisionMode(nextMode)
                                    closeSettingsMenu()
                                  }}
                                >
                                  <DropdownMenuRadioItem value="day">
                                    Giorno
                                  </DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="year">
                                    Anno
                                  </DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="monthYear">
                                    Mese
                                  </DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                              </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                          </DropdownMenuSub>
                        ) : (
                          <Button
                            key={col.columnId}
                            type="button"
                            variant={groupBy === col.columnId ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 w-full justify-between px-2 text-xs"
                            onClick={() => {
                              onGroupByChange?.(groupBy === col.columnId ? null : col.columnId)
                              closeSettingsMenu()
                            }}
                          >
                            <span className="truncate">{col.label}</span>
                            {groupBy === col.columnId && (
                              <Check className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                          </Button>
                        )
                      )}
                    </div>
                  </>
                )}
                {otherGroupColumns.length > 0 && (
                  <>
                    <DropdownMenuSeparator className="my-2" />
                    <DropdownMenuLabel className="px-0 pb-1 pt-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Altri campi
                    </DropdownMenuLabel>
                    <div className="px-0 pb-1 text-[10px] text-muted-foreground/70">
                      Potrebbe generare molti gruppi
                    </div>
                    <div className="flex flex-col gap-1">
                      {otherGroupColumns.map((col: any) => (
                        <Button
                          key={col.columnId}
                          type="button"
                          variant={groupBy === col.columnId ? "secondary" : "ghost"}
                          size="sm"
                          className="h-auto min-h-8 w-full flex-col items-start gap-0 px-2 py-1.5 text-xs"
                          onClick={() => {
                            onGroupByChange?.(groupBy === col.columnId ? null : col.columnId)
                            closeSettingsMenu()
                          }}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="truncate">{col.label}</span>
                            {groupBy === col.columnId && (
                              <Check className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                          </div>
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="size-4" />
              Colori condizionali
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-[620px] p-3">
                <ConditionalFormatsEditor
                  enabled={Boolean(onConditionalFormatsChange)}
                  formattableColumns={formattableColumns}
                  conditionalFormats={conditionalFormats}
                  activeConditionalRule={activeConditionalRule}
                  isConditionalEditorOpen={isConditionalEditorOpen}
                  setIsConditionalEditorOpen={setIsConditionalEditorOpen}
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
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Tabella */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tabella</DropdownMenuLabel>
          {columnVisibility && onColumnVisibilityChange && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Eye className="size-4" />
                Colonne visibili
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-64 p-2">
                  <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                    Visibilità colonne
                  </DropdownMenuLabel>
                  <Input
                    placeholder="Cerca colonna..."
                    value={columnSearchTerm}
                    onChange={(e) => setColumnSearchTerm(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <DropdownMenuSeparator className="my-2" />
                  <div className="max-h-56 overflow-y-auto">
                    {filteredTableColumns.length === 0 ? (
                      <div className="py-2 text-center text-xs text-muted-foreground">
                        Nessuna colonna trovata
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 py-1">
                        {filteredTableColumns.map((col: any) => {
                          const isVisible = columnVisibility[col.id] ?? true
                          return (
                            <Button
                              key={col.id}
                              type="button"
                              variant={isVisible ? "secondary" : "ghost"}
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
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
          {pageSize != null && onPageSizeChange && (
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="justify-between gap-4 focus:bg-transparent focus:text-inherit data-[highlighted]:bg-transparent data-[highlighted]:text-inherit cursor-default">
              <div className="flex items-center gap-2">
                <Rows2 className="size-4" />
                Righe
              </div>
              <div className="flex h-7 items-stretch">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className="h-7 w-7 rounded-r-none border-r-0"
                  aria-label="Diminuisci righe"
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
                  aria-label="Aumenta righe"
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
