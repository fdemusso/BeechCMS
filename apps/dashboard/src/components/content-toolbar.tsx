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
  onOpenSort,
  onOpenAutomation,
  onOpenSettings,
  searchValue = "",
  onSearchChange,
  onSubmitSearch,
  children,
}: ContentToolbarProps) {
  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Ordina"
                    onClick={() => onOpenSort?.()}
                  >
                    <ArrowUpDown className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Ordina</TooltipContent>
              </Tooltip>
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
