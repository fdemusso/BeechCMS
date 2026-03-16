import * as React from "react"
import type { Seed } from "@beech/core"
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
  X,
  Trash2,
} from "lucide-react"

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
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// TODO: derivare views, enabledTools e impostazioni da una configurazione persistente (per-utente) non appena disponibile.
// TODO: definire il flusso di creazione/modifica/eliminazione di una vista utente (onCreateView).

export type ViewType = "table" | "grid" | "kanban" | "chart"
export type ToolbarTool =
  | "filter"
  | "sort"
  | "automation"
  | "search"
  | "settings"
  | "create"

export interface UserViewInstance {
  id: string
  label: string
  type: ViewType
  enabledTools: ToolbarTool[]
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
  /** Contenuto sotto la row di funzioni (tabella, controlli, ecc.) */
  children?: React.ReactNode
}

export type FilterGroupType = "text" | "number" | "date" | "boolean" | "tags" | "select" | "system"
export type FilterOperator =
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "is_empty"
  | "is_not_empty"

export interface ToolbarFilterCondition {
  id: string
  op: FilterOperator
  value: string | number | boolean | null
}

export interface ToolbarFilterGroup {
  columnId: string
  label: string
  type: FilterGroupType
  conditions: ToolbarFilterCondition[]
  /** Opzioni predefinite per tipo "select" (es. status: ["draft","published"]) */
  selectOptions?: string[]
}

export type ToolbarFiltersState = Record<string, ToolbarFilterGroup>

// ─── Costanti di modulo ───────────────────────────────────────────────────────

/** Strumenti abilitati di default quando la vista attiva non ne specifica uno. */
const DEFAULT_ENABLED_TOOLS: ToolbarTool[] = [
  "filter",
  "sort",
  "automation",
  "search",
  "settings",
  "create",
]

// ─── Funzioni pure (nessuna dipendenza dallo scope del componente) ────────────

/**
 * Genera un ID univoco per una nuova condizione di filtro.
 * Combina timestamp e stringa casuale per evitare collisioni in sessione.
 */
function generateConditionId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Restituisce true se l'operatore richiede un valore testuale/numerico/booleano
 * da mostrare nel campo di input. Gli operatori "is_empty" e "is_not_empty"
 * sono auto-sufficienti e non necessitano di input aggiuntivo.
 */
function operatorRequiresValue(op: FilterOperator): boolean {
  return op !== "is_empty" && op !== "is_not_empty"
}

/**
 * Restituisce l'elenco di operatori disponibili per un dato tipo di colonna.
 * Ogni tipo espone solo gli operatori semanticamente significativi per evitare
 * combinazioni senza senso (es. "maggiore di" su un campo boolean).
 */
function getOperatorOptions(type: FilterGroupType): Array<{ value: FilterOperator; label: string }> {
  const baseOptions: Array<{ value: FilterOperator; label: string }> = [
    { value: "eq", label: "Uguale a" },
    { value: "is_not_empty", label: "È pieno" },
    { value: "is_empty", label: "Non è pieno" },
  ]

  if (type === "number" || type === "date") {
    return [
      { value: "gt", label: "Maggiore di" },
      { value: "lt", label: "Minore di" },
      { value: "gte", label: "Maggiore o uguale" },
      { value: "lte", label: "Minore o uguale" },
      ...baseOptions,
    ]
  }

  if (type === "tags") {
    return [
      { value: "contains", label: "Contiene" },
      { value: "is_not_empty", label: "È pieno" },
      { value: "is_empty", label: "Non è pieno" },
    ]
  }

  if (type === "select") {
    return [
      { value: "eq", label: "Uguale a" },
      { value: "is_not_empty", label: "È pieno" },
      { value: "is_empty", label: "Non è pieno" },
    ]
  }

  if (type === "text" || type === "system") {
    return [
      { value: "contains", label: "Contiene" },
      ...baseOptions,
    ]
  }

  // boolean e altri tipi: solo uguaglianza / pieno / vuoto
  return baseOptions
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
  onOpenFilters,
  onOpenSort,
  onOpenAutomation,
  onOpenSettings,
  searchValue = "",
  onSearchChange,
  onSubmitSearch,
  sortState,
  onSortChange,
  filters = {},
  onFiltersChange,
  availableTagsByColumnId = {},
  children,
}: ContentToolbarProps) {
  const activeView = views.find((v) => v.id === activeViewId)

  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [sortColumnSearchTerm, setSortColumnSearchTerm] = React.useState("")
  const [filterColumnSearchTerm, setFilterColumnSearchTerm] = React.useState("")
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
  }, [activeView?.id])

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

  /**
   * Deriva l'elenco di colonne filtrabili dal seed corrente.
   * Le colonne di sistema (slug, status) sono sempre presenti in cima.
   * I branch vengono mappati al FilterGroupType più appropriato; i tipi non
   * gestiti esplicitamente ricadono nel fallback "text".
   */
  const filterableColumns = React.useMemo(() => {
    const columns: Array<{
      columnId: string
      label: string
      type: FilterGroupType
      selectOptions?: string[]
    }> = [
      { columnId: "slug", label: "Slug", type: "system" },
      { columnId: "status", label: "Stato", type: "select", selectOptions: ["draft", "published"] },
    ]

    for (const branch of seed.branches) {
      const alias = branch.alias
      if (branch.type === "number") {
        columns.push({ columnId: alias, label: branch.label, type: "number" })
      } else if (branch.type === "date") {
        columns.push({ columnId: alias, label: branch.label, type: "date" })
      } else if (branch.type === "boolean") {
        columns.push({ columnId: alias, label: branch.label, type: "boolean" })
      } else if (branch.type === "json" && alias.toLowerCase().includes("tag")) {
        columns.push({ columnId: alias, label: branch.label, type: "tags" })
      } else if (branch.type === "text" || branch.type === "richtext") {
        columns.push({ columnId: alias, label: branch.label, type: "text" })
      } else if (branch.type === "file") {
        columns.push({ columnId: alias, label: branch.label, type: "text" })
      } else {
        columns.push({ columnId: alias, label: branch.label, type: "text" })
      }
    }

    return columns
  }, [seed.branches])

  const visibleFilterColumns = React.useMemo(() => {
    const term = filterColumnSearchTerm.trim().toLowerCase()
    if (!term) return filterableColumns
    return filterableColumns.filter((c) => c.label.toLowerCase().includes(term))
  }, [filterColumnSearchTerm, filterableColumns])

  const addConditionToColumn = React.useCallback(
    (columnId: string) => {
      if (!onFiltersChange) return
      const col = filterableColumns.find((c) => c.columnId === columnId)
      if (!col) return

      const next = { ...filters }
      const existing = next[columnId]
      const defaultOp: FilterOperator = col.type === "tags" ? "contains" : "eq"

      const newCondition: ToolbarFilterCondition = {
        id: generateConditionId(),
        op: defaultOp,
        value: null,
      }

      if (!existing) {
        next[columnId] = {
          columnId,
          label: col.label,
          type: col.type,
          conditions: [newCondition],
          selectOptions: col.selectOptions,
        }
      } else {
        next[columnId] = {
          ...existing,
          conditions: [...existing.conditions, newCondition],
        }
      }

      onFiltersChange(next)
    },
    [filterableColumns, filters, onFiltersChange]
  )

  const removeColumnFilters = React.useCallback(
    (columnId: string) => {
      if (!onFiltersChange) return
      const next = { ...filters }
      delete next[columnId]
      onFiltersChange(next)
    },
    [filters, onFiltersChange]
  )

  const updateCondition = React.useCallback(
    (
      columnId: string,
      conditionId: string,
      patch: Partial<Pick<ToolbarFilterCondition, "op" | "value">>
    ) => {
      if (!onFiltersChange) return
      const group = filters[columnId]
      if (!group) return
      const nextConditions = group.conditions.map((c) =>
        c.id === conditionId ? { ...c, ...patch } : c
      )
      onFiltersChange({
        ...filters,
        [columnId]: { ...group, conditions: nextConditions },
      })
    },
    [filters, onFiltersChange]
  )

  const removeCondition = React.useCallback(
    (columnId: string, conditionId: string) => {
      if (!onFiltersChange) return
      const group = filters[columnId]
      if (!group) return
      const nextConditions = group.conditions.filter((c) => c.id !== conditionId)
      if (nextConditions.length === 0) {
        const next = { ...filters }
        delete next[columnId]
        onFiltersChange(next)
        return
      }
      onFiltersChange({
        ...filters,
        [columnId]: { ...group, conditions: nextConditions },
      })
    },
    [filters, onFiltersChange]
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
    const nextDesc = sortState && sortState.columnId != null ? sortState.desc : true
    onSortChange({ columnId: branchAlias, desc: nextDesc })
  }

  return (
    <Card className="py-3 border-0 bg-transparent shadow-none" data-seed-slug={seed.slug}>
      <CardContent className="px-4 py-0">
        <div className="flex items-center justify-between gap-2">
          {/* Lato sinistro: viste utente + icona + */}
          <div className="flex items-center gap-1">
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
          <div className="flex items-center gap-2">
            {isToolEnabled("filter") && (
              <DropdownMenu
                open={filterMenuOpen}
                onOpenChange={(open) => {
                  setFilterMenuOpen(open)
                  if (!open) setFilterColumnSearchTerm("")
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Filtri">
                        <Filter className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">Filtri</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-64 p-2">
                  <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                    Filtra per colonna
                  </DropdownMenuLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Cerca colonna..."
                      value={filterColumnSearchTerm}
                      onChange={(e) => setFilterColumnSearchTerm(e.target.value)}
                      className="h-8 flex-1 text-sm"
                    />
                  </div>
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
                              setFilterMenuOpen(false)
                              setFilterColumnSearchTerm("")
                              setOpenPillId(col.columnId)
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
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isToolEnabled("sort") && (
              <DropdownMenu
                onOpenChange={(open) => {
                  if (!open) setSortColumnSearchTerm("")
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Ordina"
                      >
                        <ArrowUpDown className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">Ordina</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-64 p-2">
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
                              <span className="truncate">
                                {branch.label}
                              </span>
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
                </DropdownMenuContent>
              </DropdownMenu>
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
                <DropdownMenuContent align="end" className="w-72 p-3">
                  <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                    Impostazioni vista
                  </DropdownMenuLabel>

                  <div className="mb-2 flex flex-col gap-1.5">
                    <span className="text-muted-foreground text-xs">Nome vista</span>
                    <Input
                      value={viewNameDraft}
                      onChange={(e) => {
                        const next = e.target.value
                        setViewNameDraft(next)
                      }}
                      onBlur={() => {
                        commitViewName()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          commitViewName()
                          return
                        }

                        // Evita che i tasti singoli (es. A, C, R) attivino
                        // shortcut del menu mentre stai digitando nel campo.
                        if (
                          e.key.length === 1 &&
                          !e.metaKey &&
                          !e.ctrlKey &&
                          !e.altKey
                        ) {
                          e.stopPropagation()
                        }
                      }}
                      className="h-8 text-sm"
                      placeholder="Nome vista"
                    />
                  </div>

                  <DropdownMenuSeparator className="my-2" />

                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => {
                        onOpenFilters?.()
                      }}
                    >
                      <Filter className="text-muted-foreground" />
                      <span>Apri filtri</span>
                      <DropdownMenuShortcut>F</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        onOpenSort?.()
                      }}
                    >
                      <ArrowUpDown className="text-muted-foreground" />
                      <span>Apri ordinamento</span>
                      <DropdownMenuShortcut>S</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator className="my-2" />

                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => {
                        // TODO: implementare configurazione di raggruppamento vista.
                        onOpenSettings?.()
                      }}
                    >
                      <span className="inline-flex size-3 rounded-sm bg-primary/70" />
                      <span>Raggruppa...</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        // TODO: implementare colori condizionali per la vista.
                        onOpenSettings?.()
                      }}
                    >
                      <span className="inline-flex size-3 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400" />
                      <span>Colori condizionali</span>
                    </DropdownMenuItem>
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
            {Object.keys(filters).length > 0 && (
              <div className="mb-3 flex flex-wrap justify-start gap-2">
                {Object.values(filters).map((group) => (
                  <DropdownMenu
                    key={group.columnId}
                    open={openPillId === group.columnId}
                    onOpenChange={(open) =>
                      setOpenPillId(open ? group.columnId : null)
                    }
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 gap-1.5 px-2.5"
                        aria-label={`Filtro ${group.label}`}
                      >
                        <span className="truncate max-w-40">{group.label}</span>
                        <span className="text-muted-foreground text-[10px] uppercase">
                          {group.conditions.length}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72 p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={group.label}
                          readOnly
                          className="h-8 flex-1 text-sm"
                          aria-label="Colonna"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Rimuovi filtri colonna"
                          onClick={() => removeColumnFilters(group.columnId)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <DropdownMenuSeparator className="my-2" />

                      <div className="flex flex-col gap-2">
                        {group.conditions.map((cond) => {
                          const ops = getOperatorOptions(group.type)
                          const showValueInput = operatorRequiresValue(cond.op)

                          return (
                            <div
                              key={cond.id}
                              className="flex items-center gap-2"
                            >
                              <Select
                                value={cond.op}
                                onValueChange={(v) =>
                                  updateCondition(group.columnId, cond.id, {
                                    op: v as FilterOperator,
                                    value:
                                      v === "is_empty" || v === "is_not_empty"
                                        ? null
                                        : cond.value,
                                  })
                                }
                              >
                                <SelectTrigger size="sm" className="h-8 w-36">
                                  <SelectValue placeholder="Operatore" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ops.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              {showValueInput ? (
                                group.type === "number" ? (
                                  <Input
                                    type="number"
                                    value={
                                      typeof cond.value === "number"
                                        ? String(cond.value)
                                        : ""
                                    }
                                    onChange={(e) => {
                                      const raw = e.target.value
                                      updateCondition(group.columnId, cond.id, {
                                        value:
                                          raw.trim() === ""
                                            ? null
                                            : Number(raw),
                                      })
                                    }}
                                    className="h-8 flex-1 text-sm"
                                    placeholder="Valore..."
                                  />
                                ) : group.type === "date" ? (
                                  <Input
                                    type="date"
                                    value={
                                      typeof cond.value === "string"
                                        ? cond.value
                                        : ""
                                    }
                                    onChange={(e) =>
                                      updateCondition(group.columnId, cond.id, {
                                        value: e.target.value || null,
                                      })
                                    }
                                    className="h-8 flex-1 text-sm"
                                  />
                                ) : group.type === "boolean" ? (
                                  <Select
                                    value={
                                      cond.value === true
                                        ? "true"
                                        : cond.value === false
                                          ? "false"
                                          : ""
                                    }
                                    onValueChange={(v) =>
                                      updateCondition(group.columnId, cond.id, {
                                        value:
                                          v === "true"
                                            ? true
                                            : v === "false"
                                              ? false
                                              : null,
                                      })
                                    }
                                  >
                                    <SelectTrigger size="sm" className="h-8 flex-1">
                                      <SelectValue placeholder="Valore..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="true">Vero</SelectItem>
                                      <SelectItem value="false">Falso</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : group.type === "select" ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 flex-1 justify-between"
                                      >
                                        <span className="truncate">
                                          {typeof cond.value === "string" && cond.value
                                            ? cond.value
                                            : "Scegli..."}
                                        </span>
                                        <ArrowUpDown className="size-3.5 opacity-60" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 p-1">
                                      {(group.selectOptions ?? []).map((opt) => (
                                        <Button
                                          key={opt}
                                          type="button"
                                          variant={cond.value === opt ? "secondary" : "ghost"}
                                          size="sm"
                                          className="h-8 w-full justify-start px-2 text-xs"
                                          onClick={() =>
                                            updateCondition(group.columnId, cond.id, { value: opt })
                                          }
                                        >
                                          {opt}
                                        </Button>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : group.type === "tags" ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 flex-1 justify-between"
                                      >
                                        <span className="truncate">
                                          {typeof cond.value === "string" && cond.value
                                            ? cond.value
                                            : "Tag..."}
                                        </span>
                                        <ArrowUpDown className="size-3.5 opacity-60" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="max-h-56 w-56 overflow-y-auto p-1"
                                    >
                                      {(availableTagsByColumnId[group.columnId] ?? []).map((tag) => (
                                        <Button
                                          key={tag}
                                          type="button"
                                          variant={cond.value === tag ? "secondary" : "ghost"}
                                          size="sm"
                                          className="h-8 w-full justify-start px-2 text-xs"
                                          onClick={() =>
                                            updateCondition(group.columnId, cond.id, { value: tag })
                                          }
                                        >
                                          {tag}
                                        </Button>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : (
                                  <Input
                                    value={
                                      typeof cond.value === "string"
                                        ? cond.value
                                        : ""
                                    }
                                    onChange={(e) =>
                                      updateCondition(group.columnId, cond.id, {
                                        value: e.target.value || null,
                                      })
                                    }
                                    className="h-8 flex-1 text-sm"
                                    placeholder="Valore..."
                                  />
                                )
                              ) : (
                                <div className="h-8 flex-1" />
                              )}

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="h-8 w-8"
                                aria-label="Rimuovi condizione"
                                onClick={() =>
                                  removeCondition(group.columnId, cond.id)
                                }
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                          )
                        })}

                        <DropdownMenuSeparator />
                        <div className="flex justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => addConditionToColumn(group.columnId)}
                          >
                            <Plus className="size-4" />
                            Aggiungi filtro
                          </Button>
                        </div>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}
              </div>
            )}
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
