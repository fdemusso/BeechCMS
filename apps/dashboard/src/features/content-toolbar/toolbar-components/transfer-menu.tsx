// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { isFlatSeed, nonFlatBranches } from "@beechcms/core"
import type { Seed, TransferFormat } from "@beechcms/core"
import { Export, Import, Loader } from "reicon-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePermissions } from "@/features/shared/hooks/use-permissions"

export interface TransferMenuProps {
  readonly seed: Seed
  readonly onExport?: (format: TransferFormat) => void
  readonly onOpenImport?: () => void
  readonly isExportPending?: boolean
}

export function TransferMenu({ seed, onExport, onOpenImport, isExportPending }: TransferMenuProps) {
  const { t } = useTranslation()
  const { can } = usePermissions()

  const showExportGroup = can("content:read", seed.slug) && !!onExport
  const showImportRow = can("content:create", seed.slug) && !!onOpenImport

  if (!showExportGroup && !showImportRow) return null

  const seedIsFlat = isFlatSeed(seed)
  const offendingAliases = nonFlatBranches(seed).map((branch) => branch.alias)

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("transfer.menu.tooltip")}>
              {isExportPending ? <Loader className="size-4 animate-spin" /> : <Export className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("transfer.menu.tooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        {showExportGroup && (
          <>
            <DropdownMenuLabel>{t("transfer.menu.exportGroup")}</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!seedIsFlat || isExportPending}
              onSelect={() => onExport?.("csv")}
            >
              CSV
            </DropdownMenuItem>
            {!seedIsFlat && (
              <DropdownMenuLabel className="px-2 pb-1.5 text-xs font-normal text-muted-foreground">
                {t("transfer.menu.csvDisabled", { branches: offendingAliases.join(", ") })}
              </DropdownMenuLabel>
            )}
            <DropdownMenuItem disabled={isExportPending} onSelect={() => onExport?.("ndjson")}>
              NDJSON
            </DropdownMenuItem>
          </>
        )}
        {showExportGroup && showImportRow && <DropdownMenuSeparator />}
        {showImportRow && (
          <DropdownMenuItem onSelect={() => onOpenImport?.()}>
            <Import className="size-4" />
            {t("transfer.menu.import")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
