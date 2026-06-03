// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Filter } from "lucide-react"
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

interface FilterColumn {
  columnId: string
  label: string
}

interface FilterColumnMenuProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  isActive?: boolean
  onOpen?: () => void
  searchTerm: string
  onSearchTermChange: (value: string) => void
  visibleFilterColumns: FilterColumn[]
  activeFiltersCountByColumn: Record<string, number>
  onSelectColumn: (columnId: string) => void
}

export function FilterColumnMenu({
  open,
  onOpenChange,
  isActive,
  onOpen,
  searchTerm,
  onSearchTermChange,
  visibleFilterColumns,
  activeFiltersCountByColumn,
  onSelectColumn,
}: Readonly<FilterColumnMenuProps>) {
  const { t } = useTranslation()
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange?.(nextOpen)
        if (nextOpen) onOpen?.()
        if (!nextOpen) onSearchTermChange("")
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={t("toolbar.filter.tooltip")}
            >
              <Filter className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("toolbar.filter.tooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
          {t("toolbar.filter.label")}
        </DropdownMenuLabel>
        <Input
          placeholder={t("toolbar.filter.searchPlaceholder")}
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="h-8 text-sm"
        />
        <DropdownMenuSeparator className="my-2" />
        <ScrollArea className="max-h-56 pr-2">
          {visibleFilterColumns.length === 0 ? (
            <div className="py-2 text-center text-xs text-muted-foreground">{t("toolbar.filter.noColumns")}</div>
          ) : (
            <div className="flex flex-col gap-1 py-1">
              {visibleFilterColumns.map((col) => (
                <Button
                  key={col.columnId}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-between px-2 text-xs"
                  onClick={() => onSelectColumn(col.columnId)}
                >
                  <span className="truncate">{col.label}</span>
                  {activeFiltersCountByColumn[col.columnId] ? (
                    <span className="text-muted-foreground text-[10px] uppercase">
                      {activeFiltersCountByColumn[col.columnId]}
                    </span>
                  ) : null}
                </Button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
