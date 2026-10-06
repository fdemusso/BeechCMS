// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Plus, ChevronDown } from "reicon-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface NewEntryButtonProps {
  readonly canCreate: boolean
  readonly onCreate: () => void
  /** Content type name shown in the templates header (labelPlural ?? label). */
  readonly seedLabel: string
}

export function NewEntryButton({ canCreate, onCreate, seedLabel }: NewEntryButtonProps) {
  const { t } = useTranslation()

  const group = (
    <div className="inline-flex">
      <Button variant="default" size="sm" className="rounded-r-none gap-1.5 bg-clip-border" onClick={onCreate} disabled={!canCreate}>
        <Plus className="size-4" />
        {t("siteHeader.new")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size="sm"
            className="rounded-l-none border-l-primary-foreground/20 bg-clip-border px-1.5"
            aria-label={t("toolbar.newEntry.moreOptions")}
            disabled={!canCreate}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{t("toolbar.newEntry.templatesTitle", { label: seedLabel })}</DropdownMenuLabel>
          <p className="px-2 pb-2 text-sm text-muted-foreground">
            {t("toolbar.newEntry.templatesDescription")}
          </p>
          <DropdownMenuSeparator />
          {/* Templates are not implemented yet: keep the entry visible but inert. */}
          <DropdownMenuItem disabled>
            <Plus className="size-4" />
            {t("toolbar.newEntry.newTemplate")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  if (canCreate) return group

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{group}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">Manca il permesso 'content:create'</TooltipContent>
    </Tooltip>
  )
}
