import * as React from "react"
import type { Seed } from "@beech/core"
import type { VisibilityState } from "@tanstack/react-table"
import type { DateGroupPrecision } from "@/lib/dynamic-columns"
import {
  Table,
  LayoutGrid,
  LayoutList,
  PieChart,
  Filter,
  ArrowUpDown,
  Zap,
  Search,
  Settings,
  Plus,
  Minus,
  X,
  Rows3,
  Rows2,
  Eye,
  Palette,
  EyeOff,
  Check,
} from "lucide-react"
import type { ConditionalFormatRule } from "@/lib/conditional-format"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
import { FilterColumnMenu } from "@/components/content-toolbar/filter-column-menu"
import { SortColumnMenu } from "@/components/content-toolbar/sort-column-menu"
import { FilterPillsBar } from "@/components/content-toolbar/filter-pills-bar"
import { ConditionalFormatsEditor } from "@/components/content-toolbar/conditional-formats-editor"
import { useToolbarFilters } from "@/hooks/use-toolbar-filters"
import { useConditionalFormats } from "@/hooks/use-conditional-formats"
import {
  DEFAULT_ENABLED_TOOLS,
  getGroupableColumns,
} from "@/components/content-toolbar/shared"
import type {
  ToolbarFiltersState,
  ToolbarTool,
  ViewType,
} from "@/components/content-toolbar/shared"

// TODO: derivare views, enabledTools e impostazioni da una configurazione persistente (per-utente) non appena disponibile.
// TODO: definire il flusso di creazione/modifica/eliminazione di una vista utente (onCreateView).

export type {
  FilterGroupType,
  FilterOperator,
  ToolbarFilterCondition,
  ToolbarFilterGroup,
  ToolbarFiltersState,
  ToolbarTool,
  ViewType,
} from "@/components/content-toolbar/shared"

export interface UserViewInstance {
  id: string
  label: string
  type: ViewType
  enabledTools: ToolbarTool[]
  /** Regole di colori condizionali legate alla vista (ordinamento per priority). */
  conditionalFormats?: ConditionalFormatRule[]
}

const VIEW_TYPE_ICONS: Record<ViewType, React.ComponentType<{ className?: string }>> = {
  table: Table,
  grid: LayoutGrid,
  kanban: LayoutList,
  chart: PieChart,
}

export interface ContentToolbarProps {
  seed: Seed
  views: UserViewInstance[]
  activeViewId: string
  onChangeView: (viewId: string) => void
  /** Aggiorna le regole colori condizionali della vista attiva. */
  onConditionalFormatsChange?: (
    viewId: string,
    next: ConditionalFormatRule[]
  ) => void
  onCreateView?: () => void
  onRenameView?: (viewId: string, label: string) => void
  onCreate: () => void
  onOpenFilters?: () => void
  onOpenSort?: () => void
  onOpenAutomation?: () => void
  onOpenSettings?: () => void
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSubmitSearch?: (value: string) => void
  isFilterActive?: boolean
  isSortActive?: boolean
  isAutomationActive?: boolean
  isSettingsOpen?: boolean
  sortState?: {
    columnId: string | null
    desc: boolean
  }
  onSortChange?: (state: { columnId: string | null; desc: boolean }) => void
  /** Filtri Notion-like: 1 pill per colonna, più condizioni AND */
  filters?: ToolbarFiltersState
  onFiltersChange?: (state: ToolbarFiltersState) => void
  /** Valori disponibili per i campi tags (columnId -> tags) */
  availableTagsByColumnId?: Record<string, string[]>
  /** Stati disponibili ricavati dai dati/DB (nessun hardcode). */
  availableStatusOptions?: string[]
  /** Numero di righe per pagina della tabella (controllato dall'esterno). */
  pageSize?: number
  /** Callback per aggiornare il numero di righe per pagina. */
  onPageSizeChange?: (size: number) => void
  /** Visibilità colonne della tabella (controllata dall'esterno). */
  columnVisibility?: VisibilityState
  /** Callback per aggiornare la visibilità delle colonne della tabella. */
  onColumnVisibilityChange?: (visibility: VisibilityState) => void
  /** Colonna attiva per il raggruppamento (columnId o null). */
  groupBy?: string | null
  /** Callback per aggiornare la colonna di raggruppamento. */
  onGroupByChange?: (columnId: string | null) => void
  /** Granularità per branch di tipo date (anno/mese/giorno). */
  dateGroupPrecision?: DateGroupPrecision
  /** Callback per aggiornare la granularità date. */
  onDateGroupPrecisionChange?: (precision: DateGroupPrecision) => void
  /** Contenuto sotto la row di funzioni (tabella, controlli, ecc.) */
  children?: React.ReactNode
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ContentToolbar({
  seed,
  views,
  activeViewId,
  onChangeView,
  onCreateView,
  onRenameView,
  onCreate,
  onOpenAutomation,
  searchValue = "",
  onSearchChange,
  onSubmitSearch,
  sortState,
  onSortChange,
  filters = {},
  onFiltersChange,
  availableTagsByColumnId = {},
  availableStatusOptions = [],
  pageSize,
  onPageSizeChange,
  columnVisibility,
  onColumnVisibilityChange,
  groupBy = null,
  onGroupByChange,
  dateGroupPrecision = { year: true, month: true, day: false },
  onDateGroupPrecisionChange,
  onConditionalFormatsChange,
  children,
}: ContentToolbarProps) {
  const activeView = views.find((v) => v.id === activeViewId)

  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [sortColumnSearchTerm, setSortColumnSearchTerm] = React.useState("")
  const [filterColumnSearchTerm, setFilterColumnSearchTerm] = React.useState("")
  const [columnSearchTerm, setColumnSearchTerm] = React.useState("")
  const [filterMenuOpen, setFilterMenuOpen] = React.useState(false)
  const [openPillId, setOpenPillId] = React.useState<string | null>(null)
  const [viewNameDraft, setViewNameDraft] = React.useState(activeView?.label ?? "")
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = React.useState(false)

  const enabledTools = React.useMemo(
    () => activeView?.enabledTools ?? DEFAULT_ENABLED_TOOLS,
    [activeView]
  )

  // Focus il campo di ricerca dopo che il render lo ha reso visibile nel DOM.
  React.useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus()
  }, [isSearchOpen])

  React.useEffect(() => {
    setViewNameDraft(activeView?.label ?? "")
  }, [activeView?.id, activeView?.label])

  const commitViewName = React.useCallback(
    () => {
      if (!activeView || !onRenameView) return
      const trimmed = viewNameDraft.trim()
      if (!trimmed || trimmed === activeView.label) return
      onRenameView(activeView.id, trimmed)
    },
    [activeView, onRenameView, viewNameDraft]
  )

  const handleSearchOpen = () => setIsSearchOpen(true)

  const handleSearchClose = () => {
    setIsSearchOpen(false)
    onSearchChange?.("")
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = searchInputRef.current?.value ?? searchValue
    onSubmitSearch?.(value)
    // TODO: collegare la ricerca all'API di fetchContentList con parametri (search per view attiva).
  }

  // Chiude il campo di ricerca solo se non contiene testo, evitando di
  // perdere una query attiva quando l'utente clicca altrove.
  const handleSearchBlur = () => {
    if (!searchValue && !searchInputRef.current?.value) {
      handleSearchClose()
    }
  }

  const isToolEnabled = (tool: ToolbarTool) => enabledTools.includes(tool)

  const sortableBranches = React.useMemo(
    () =>
      seed.branches.filter((branch) =>
        ["text", "number", "date"].includes(branch.type as string)
      ),
    [seed.branches]
  )

  const filteredSortableColumns = React.useMemo(() => {
    const term = sortColumnSearchTerm.trim().toLowerCase()
    if (!term) return sortableBranches
    return sortableBranches.filter((branch) =>
      branch.label.toLowerCase().includes(term)
    )
  }, [sortColumnSearchTerm, sortableBranches])

  const {
    filterableColumns,
    formattableColumns,
    addConditionToColumn,
    removeColumnFilters,
    updateCondition,
    removeCondition,
  } = useToolbarFilters({
    seed,
    filters,
    onFiltersChange,
    availableStatusOptions,
  })

  const {
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
  } = useConditionalFormats({
    viewId: activeView?.id,
    conditionalFormatsInput: activeView?.conditionalFormats,
    formattableColumns,
    onConditionalFormatsChange,
  })

  const tableColumns = React.useMemo(
    () =>
      [
        { id: "slug", label: "Slug" },
        { id: "status", label: "Stato" },
        ...seed.branches.map((branch) => ({
          id: branch.alias,
          label: branch.label,
        })),
      ] as Array<{ id: string; label: string }>,
    [seed.branches]
  )

  const visibleFilterColumns = React.useMemo(() => {
    const term = filterColumnSearchTerm.trim().toLowerCase()
    if (!term) return filterableColumns
    return filterableColumns.filter((c) => c.label.toLowerCase().includes(term))
  }, [filterColumnSearchTerm, filterableColumns])

  const activeFiltersCountByColumn = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filters).map(([columnId, group]) => [columnId, group.conditions.length])
      ),
    [filters]
  )

  const filteredTableColumns = React.useMemo(() => {
    const term = columnSearchTerm.trim().toLowerCase()
    if (!term) return tableColumns
    return tableColumns.filter((c) => c.label.toLowerCase().includes(term))
  }, [columnSearchTerm, tableColumns])

  const groupableColumns = React.useMemo(
    () => getGroupableColumns(seed, availableStatusOptions),
    [availableStatusOptions, seed]
  )

  const recommendedGroupColumns = React.useMemo(
    () => groupableColumns.filter((c) => c.section === "recommended"),
    [groupableColumns]
  )

  const otherGroupColumns = React.useMemo(
    () => groupableColumns.filter((c) => c.section === "other"),
    [groupableColumns]
  )

  const activeGroupLabel = React.useMemo(() => {
    if (!groupBy) return null
    return groupableColumns.find((c) => c.columnId === groupBy)?.label ?? groupBy
  }, [groupBy, groupableColumns])

  /**
   * Deriva una modalità unica dalla precisione corrente.
   * - day: giorno (con anno) — esclusivo
   * - year: solo anno
   * - monthYear: mese + anno (default)
   */
  type DatePrecisionMode = "day" | "year" | "monthYear"

  const datePrecisionMode: DatePrecisionMode = React.useMemo(() => {
    if (dateGroupPrecision.day) return "day"
    if (dateGroupPrecision.year && dateGroupPrecision.month) return "monthYear"
    if (dateGroupPrecision.year && !dateGroupPrecision.month) return "year"
    // fallback: qualsiasi stato “strano” lo normalizziamo al default richiesto
    return "monthYear"
  }, [dateGroupPrecision.day, dateGroupPrecision.month, dateGroupPrecision.year])

  const applyDatePrecisionMode = React.useCallback(
    (mode: DatePrecisionMode) => {
      if (!onDateGroupPrecisionChange) return
      if (mode === "day") {
        onDateGroupPrecisionChange({ year: false, month: false, day: true })
        return
      }
      if (mode === "year") {
        onDateGroupPrecisionChange({ year: true, month: false, day: false })
        return
      }
      onDateGroupPrecisionChange({ year: true, month: true, day: false })
    },
    [onDateGroupPrecisionChange]
  )

  const handleToggleSortDirection = () => {
    if (!onSortChange || !sortState?.columnId) return
    onSortChange({
      columnId: sortState.columnId,
      desc: !sortState.desc,
    })
  }

  const handleSortColumnSelect = (branchAlias: string) => {
    if (!onSortChange) return

    const isCurrentlySelected = sortState?.columnId === branchAlias

    if (isCurrentlySelected) {
      onSortChange({ columnId: null, desc: true })
      return
    }

    // Mantiene la direzione di ordinamento già impostata, se presente.
    const nextDesc = sortState?.columnId == null ? true : sortState.desc
    onSortChange({ columnId: branchAlias, desc: nextDesc })
  }

  return (
    <Card className="py-3 border-0 bg-transparent shadow-none" data-seed-slug={seed.slug}>
      <CardContent className="px-4 py-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* Lato sinistro: viste utente + icona + */}
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            <ToggleGroup
              type="single"
              value={activeViewId}
              onValueChange={(v) => v && onChangeView(v)}
              variant="outline"
              size="sm"
              className="gap-0"
            >
              {views.map((view) => {
                const Icon = VIEW_TYPE_ICONS[view.type]
                return (
                  <ToggleGroupItem
                    key={view.id}
                    value={view.id}
                    aria-label={view.label}
                    className="h-8 gap-1.5 px-2.5"
                  >
                    {Icon && <Icon className="size-4 shrink-0" />}
                    <span className="truncate max-w-24">{view.label}</span>
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 shrink-0"
                  aria-label="Aggiungi vista"
                  onClick={() => {
                    // TODO: implementare flusso creazione nuova vista (onCreateView).
                    onCreateView?.()
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Aggiungi vista</TooltipContent>
            </Tooltip>
          </div>

          {/* Lato destro: strumenti */}
          <div className="flex shrink-0 items-center gap-2">
            {isToolEnabled("filter") && (
              <FilterColumnMenu
                open={filterMenuOpen}
                onOpenChange={setFilterMenuOpen}
                searchTerm={filterColumnSearchTerm}
                onSearchTermChange={setFilterColumnSearchTerm}
                visibleFilterColumns={visibleFilterColumns}
                activeFiltersCountByColumn={activeFiltersCountByColumn}
                onSelectColumn={(columnId) => {
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
              />
            )}
            {isToolEnabled("automation") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Automazione"
                    onClick={() => onOpenAutomation?.()}
                  >
                    <Zap className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Automazione</TooltipContent>
              </Tooltip>
            )}
            {isToolEnabled("search") && (
              <div
                className="overflow-hidden rounded-md border border-input bg-transparent transition-[width] duration-200 ease-out"
                style={{ width: isSearchOpen ? 192 : 32 }}
              >
                {!isSearchOpen ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 shrink-0"
                        aria-label="Cerca"
                        onClick={handleSearchOpen}
                      >
                        <Search className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Cerca</TooltipContent>
                  </Tooltip>
                ) : (
                  <form
                    onSubmit={handleSearchSubmit}
                    className="relative flex min-w-[192px] items-center"
                  >
                    <Search className="text-muted-foreground pointer-events-none absolute left-2.5 size-4 shrink-0" />
                    <Input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Cerca..."
                      value={searchValue}
                      onChange={(e) => onSearchChange?.(e.target.value)}
                      onBlur={handleSearchBlur}
                      className="h-8 w-full border-0 bg-transparent pl-8 pr-8 focus-visible:ring-0 focus-visible:ring-offset-0"
                      aria-label="Cerca"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute right-1 h-6 w-6 shrink-0"
                      aria-label="Chiudi ricerca"
                      onClick={handleSearchClose}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </form>
                )}
              </div>
            )}
            {isToolEnabled("settings") && (
              <DropdownMenu
                open={isSettingsMenuOpen}
                onOpenChange={(open) => {
                  if (!open) {
                    commitViewName()
                    setColumnSearchTerm("")
                  }
                  setIsSettingsMenuOpen(open)
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
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
                          // Evita che i tasti singoli attivino shortcut del menu.
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
                        <Filter />
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
                                {visibleFilterColumns.map((col) => (
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
                                      setIsSettingsMenuOpen(false)
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
                        <ArrowUpDown />
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
                                {filteredSortableColumns.map((branch) => {
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
                        <Rows3 />
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
                            variant={!groupBy ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 w-full justify-between px-2 text-xs"
                            onClick={() => {
                              onGroupByChange?.(null)
                              setIsSettingsMenuOpen(false)
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
                                {recommendedGroupColumns.map((col) =>
                                  col.branchType === "date" ? (
                                    /* Colonne date: sub-menu annidato per la granularità */
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
                                              // Applica subito raggruppamento + precisione e chiude il menu.
                                              onGroupByChange?.(col.columnId)
                                              applyDatePrecisionMode(nextMode)
                                              setIsSettingsMenuOpen(false)
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
                                    /* Tutte le altre colonne consigliate: bottone normale */
                                    <Button
                                      key={col.columnId}
                                      type="button"
                                      variant={groupBy === col.columnId ? "secondary" : "ghost"}
                                      size="sm"
                                      className="h-8 w-full justify-between px-2 text-xs"
                                      onClick={() => {
                                        onGroupByChange?.(groupBy === col.columnId ? null : col.columnId)
                                        setIsSettingsMenuOpen(false)
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
                                {otherGroupColumns.map((col) => (
                                  <Button
                                    key={col.columnId}
                                    type="button"
                                    variant={groupBy === col.columnId ? "secondary" : "ghost"}
                                    size="sm"
                                    className="h-auto min-h-8 w-full flex-col items-start gap-0 px-2 py-1.5 text-xs"
                                    onClick={() => {
                                      onGroupByChange?.(groupBy === col.columnId ? null : col.columnId)
                                      setIsSettingsMenuOpen(false)
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
                        <Palette />
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
                          <Eye />
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
                                  {filteredTableColumns.map((col) => {
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
                          <Rows2 />
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
            )}
            {isToolEnabled("create") && (
              <Button
                variant="default"
                size="sm"
                onClick={onCreate}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Nuovo
              </Button>
            )}
          </div>
        </div>
        {children != null && (
          <div className="mt-4 border-t pt-4">
            {(Object.keys(filters).length > 0 || activeGroupLabel) && (
              <FilterPillsBar
                filters={filters}
                openPillId={openPillId}
                onOpenPillChange={setOpenPillId}
                groupBy={groupBy}
                activeGroupLabel={activeGroupLabel ?? ""}
                onGroupByChange={onGroupByChange}
                addConditionToColumn={addConditionToColumn}
                removeColumnFilters={removeColumnFilters}
                updateCondition={updateCondition}
                removeCondition={removeCondition}
                availableTagsByColumnId={availableTagsByColumnId}
              />
            )}
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
