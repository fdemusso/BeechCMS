import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface SortableColumn {
  alias: string
  label: string
}

interface SortColumnMenuProps {
  searchTerm: string
  onSearchTermChange: (value: string) => void
  filteredSortableColumns: SortableColumn[]
  sortState?: { columnId: string | null; desc: boolean }
  onToggleDirection: () => void
  onSelectColumn: (columnId: string) => void
}

export function SortColumnMenu({
  searchTerm,
  onSearchTermChange,
  filteredSortableColumns,
  sortState,
  onToggleDirection,
  onSelectColumn,
}: SortColumnMenuProps) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) onSearchTermChange("")
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Ordina">
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
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="h-8 flex-1 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="h-8 w-8 shrink-0"
            aria-label="Inverti ordine"
            onClick={onToggleDirection}
            disabled={!sortState?.columnId}
          >
            <ArrowUpDown className="size-3.5" />
          </Button>
        </div>
        <DropdownMenuSeparator className="my-2" />
        <div className="max-h-56 overflow-y-auto">
          {filteredSortableColumns.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">Nessuna colonna trovata</div>
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
                    onClick={() => onSelectColumn(branch.alias)}
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
