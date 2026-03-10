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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
  /** Contenuto sotto la row di funzioni (tabella, controlli, ecc.) */
  children?: React.ReactNode
}

export function ContentToolbar({
  seed,
  views,
  activeViewId,
  onChangeView,
  onCreateView,
  onCreate,
  onOpenFilters,
  onOpenAutomation,
  onOpenSettings,
  searchValue = "",
  onSearchChange,
  onSubmitSearch,
  sortState,
  onSortChange,
  children,
}: ContentToolbarProps) {
  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [sortSearch, setSortSearch] = React.useState("")

  const activeView = views.find((v) => v.id === activeViewId)
  const enabledTools = activeView?.enabledTools ?? [
    "filter",
    "sort",
    "automation",
    "search",
    "settings",
    "create",
  ]

  const handleSearchOpen = () => {
    setIsSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

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

  const handleSearchBlur = () => {
    if (!searchValue && !searchInputRef.current?.value) {
      handleSearchClose()
    }
  }

  const toolEnabled = (tool: ToolbarTool) => enabledTools.includes(tool)

  const sortableBranches = React.useMemo(
    () =>
      seed.branches.filter((branch) =>
        ["text", "number", "date"].includes(branch.type as string)
      ),
    [seed.branches]
  )

  const filteredBranches = React.useMemo(() => {
    const term = sortSearch.trim().toLowerCase()
    if (!term) return sortableBranches
    return sortableBranches.filter((branch) =>
      branch.label.toLowerCase().includes(term)
    )
  }, [sortSearch, sortableBranches])

  const handleToggleSortDirection = () => {
    if (!onSortChange || !sortState?.columnId) return
    onSortChange({
      columnId: sortState.columnId,
      desc: !sortState.desc,
    })
  }

  const handleSelectBranch = (branchAlias: string) => {
    if (!onSortChange) return

    const isCurrentlySelected = sortState?.columnId === branchAlias

    if (isCurrentlySelected) {
      onSortChange({ columnId: null, desc: true })
      return
    }

    const nextDesc =
      sortState && sortState.columnId != null ? sortState.desc : true

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
            {toolEnabled("filter") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Filtri"
                    onClick={() => {
                      // TODO: collegare filtro/sort/automation/settings alle modali o pannelli dedicati.
                      onOpenFilters?.()
                    }}
                  >
                    <Filter className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Filtri</TooltipContent>
              </Tooltip>
            )}
            {toolEnabled("sort") && (
              <DropdownMenu
                onOpenChange={(open) => {
                  if (!open) {
                    setSortSearch("")
                  }
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
                <DropdownMenuContent
                  align="end"
                  className="w-64 p-2"
                >
                  <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
                    Ordina per colonna
                  </DropdownMenuLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Cerca colonna..."
                      value={sortSearch}
                      onChange={(e) => setSortSearch(e.target.value)}
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
                    {filteredBranches.length === 0 ? (
                      <div className="py-2 text-center text-xs text-muted-foreground">
                        Nessuna colonna trovata
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 py-1">
                        {filteredBranches.map((branch) => {
                          const isSelected =
                            sortState?.columnId === branch.alias
                          return (
                            <Button
                              key={branch.alias}
                              type="button"
                              variant={isSelected ? "secondary" : "ghost"}
                              size="sm"
                              className="h-8 justify-between px-2 text-xs"
                              onClick={() => handleSelectBranch(branch.alias)}
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
            {toolEnabled("automation") && (
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
            {toolEnabled("search") && (
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
            {toolEnabled("settings") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Impostazioni vista"
                    onClick={() => onOpenSettings?.()}
                  >
                    <Settings className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Impostazioni vista</TooltipContent>
              </Tooltip>
            )}
            {toolEnabled("create") && (
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
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
