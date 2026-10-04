// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { resolveKanbanConfig, resolveKanbanColumns } from "@beechcms/core"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RowVertical as Rows3, Eye, EyeOff, Check, Grid as LayoutGrid } from "reicon-react"
import type { ViewSettingsSectionProps } from "@/features/shared"

/** The Kanban View Type's own settings-menu block: axis group-by, visible kanban columns and card layout. */
export function KanbanSettingsSection({ seed, layout, onClose, onOpenConfigDialog }: ViewSettingsSectionProps) {
  const { t } = useTranslation()
  const kanbanCompat = resolveKanbanConfig(seed)
  const candidates = kanbanCompat.compatible ? kanbanCompat.candidates : []
  const axisBranch = seed.branches.find((b) => b.id === layout.kanban.axisBranchId)
  const kanbanCols = axisBranch ? resolveKanbanColumns(axisBranch) : []

  if (candidates.length === 0) return null

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{t("toolbar.settings.layoutStyle")}</DropdownMenuLabel>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Rows3 className="size-4" />
          {t("toolbar.settings.groupBy")}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-64 p-2">
            <DropdownMenuLabel className="px-0 pb-2 pt-0 text-xs font-medium text-muted-foreground">
              {t("toolbar.settings.groupBy")}
            </DropdownMenuLabel>
            <div className="flex flex-col gap-1">
              {candidates.map((c) => {
                const isSelected = layout.kanban.axisBranchId === c.branchId
                return (
                  <Button
                    key={c.branchId}
                    type="button"
                    variant={isSelected ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 w-full justify-between px-2 text-xs"
                    onClick={() => {
                      layout.setKanban({
                        axisBranchId: c.branchId,
                        sort: null,
                        hiddenColumnValues: [],
                        collapsedColumnValues: layout.kanban.collapsedColumnValues ?? [],
                      })
                      onClose()
                    }}
                  >
                    <span className="truncate">{c.label}</span>
                    {isSelected && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
                  </Button>
                )
              })}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>

      {axisBranch && kanbanCols.length > 0 && (
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
              <ScrollArea className="max-h-56 pr-2">
                <div className="flex flex-col gap-1 py-1">
                  {kanbanCols.filter((c) => c.value !== null).map((c) => {
                    const isHidden = (layout.kanban.hiddenColumnValues ?? []).includes(c.value!)
                    return (
                      <Button
                        key={c.value}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 justify-between px-2 text-xs"
                        onClick={() => {
                          const hiddenSet = new Set(layout.kanban.hiddenColumnValues ?? [])
                          if (hiddenSet.has(c.value!)) {
                            hiddenSet.delete(c.value!)
                          } else {
                            hiddenSet.add(c.value!)
                          }
                          layout.setKanban({
                            axisBranchId: layout.kanban.axisBranchId,
                            sort: null,
                            hiddenColumnValues: Array.from(hiddenSet),
                            collapsedColumnValues: layout.kanban.collapsedColumnValues ?? [],
                          })
                        }}
                      >
                        <span className="truncate">{c.label}</span>
                        {!isHidden ? (
                          <Eye className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <EyeOff className="size-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                      </Button>
                    )
                  })}
                </div>
              </ScrollArea>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      )}

      <DropdownMenuItem
        onSelect={() => {
          onOpenConfigDialog()
          onClose()
        }}
      >
        <LayoutGrid className="size-4" />
        {t("kanban.cardConfig.openConfig", "Configure card layout")}
      </DropdownMenuItem>
    </DropdownMenuGroup>
  )
}
