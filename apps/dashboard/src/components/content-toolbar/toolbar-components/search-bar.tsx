import type { SyntheticEvent } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface SearchBarProps {
  isSearchOpen: boolean
  searchValue: string
  searchInputRef: React.RefObject<HTMLInputElement | null>
  handleSearchSubmit: (e: SyntheticEvent<HTMLFormElement>) => void
  onSearchChange?: (value: string) => void
  handleSearchBlur: () => void
  handleSearchClose: () => void
  handleSearchOpen: () => void
}

export function SearchBar({
  isSearchOpen,
  searchValue,
  searchInputRef,
  handleSearchSubmit,
  onSearchChange,
  handleSearchBlur,
  handleSearchClose,
  handleSearchOpen,
}: SearchBarProps) {
  return (
    <div
      className="overflow-hidden rounded-md border border-input bg-transparent transition-[width] duration-200 ease-out"
      style={{ width: isSearchOpen ? 192 : 32 }}
    >
      {isSearchOpen ? (
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
      ) : (
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
      )}
    </div>
  )
}
