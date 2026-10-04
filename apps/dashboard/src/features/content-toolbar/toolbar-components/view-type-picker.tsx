// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Plus } from "reicon-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DashboardView } from "@beechcms/core"
import { VIEW_TYPE_CATALOGUE } from "./view-type-catalogue"

export interface ViewTypePickerProps {
  /** Types the user may create here: the seed allow-list, already empty without content:update. */
  readonly creatableViewTypes: readonly DashboardView[]
  readonly onCreateView: (type: DashboardView) => void
  /** Classes for the trigger, so the switcher can apply its hover reveal. */
  readonly triggerClassName?: string
}

export function ViewTypePicker({ creatableViewTypes, onCreateView, triggerClassName }: ViewTypePickerProps) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("content.views.add")} className={triggerClassName}>
              <Plus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("content.views.add")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-[400px] max-w-[calc(100vw-2rem)] p-3">
        <DropdownMenuLabel className="px-1 pb-2 pt-0 text-xs font-medium text-muted-foreground">
          {t("content.views.pickerTitle")}
        </DropdownMenuLabel>
        <div className="grid grid-cols-4 gap-2">
          {VIEW_TYPE_CATALOGUE.map(({ type, labelKey, Icon }) => {
            const enabled = creatableViewTypes.includes(type as DashboardView)
            return (
              <DropdownMenuItem
                key={type}
                disabled={!enabled}
                onSelect={() => onCreateView(type as DashboardView)}
                className="flex-col justify-center gap-1.5 h-16 rounded-lg p-1.5 text-center cursor-pointer data-disabled:cursor-not-allowed"
              >
                <Icon className="size-5 shrink-0" />
                <span className="text-xs font-medium leading-tight truncate max-w-full" title={t(labelKey)}>
                  {t(labelKey)}
                </span>
              </DropdownMenuItem>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
