// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  isActive?: boolean
  onOpen?: () => void
}

export function SortColumnMenu({
  searchTerm,
  onSearchTermChange,
  filteredSortableColumns,
  sortState,
  onToggleDirection,
  onSelectColumn,
  isActive,
  onOpen,
}: Readonly<SortColumnMenuProps>) {
  const { t } = useTranslation()
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) onSearchTermChange("")
        if (open) onOpen?.()
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={t("toolbar.sort.tooltip")}
            >
              <ArrowUpDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("toolbar.sort.tooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
          {t("toolbar.sort.label")}
        </DropdownMenuLabel>
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("toolbar.sort.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="h-8 flex-1 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="h-8 w-8 shrink-0"
            aria-label={t("toolbar.sort.invertOrder")}
            onClick={onToggleDirection}
            disabled={!sortState?.columnId}
          >
            <ArrowUpDown className="size-3.5" />
          </Button>
        </div>
        <DropdownMenuSeparator className="my-2" />
        <ScrollArea className="max-h-56 pr-2">
          {filteredSortableColumns.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">{t("toolbar.sort.noColumns")}</div>
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
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
