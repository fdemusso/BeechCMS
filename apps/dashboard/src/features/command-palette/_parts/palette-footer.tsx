// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { useCommandState } from "cmdk"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { MOD_KEY_LABEL } from "@/lib/platform"
import type { CommandPage, ResolvedPaletteItem } from "../types"

interface PaletteFooterProps {
  readonly page: CommandPage
  /** The rows currently listed; the selected one is found by cmdk's selected value. */
  readonly items: readonly ResolvedPaletteItem[]
}

const FOOTER_CLASS = "p-3 border-t text-xs text-muted-foreground bg-muted/20"

/** Back hint on sub-pages; on root, the key hints of the selected row when it has actions. */
export function PaletteFooter({ page, items }: PaletteFooterProps) {
  const { t } = useTranslation()
  const selectedId = useCommandState((state) => state.value)

  if (page !== "root") {
    return <div className={FOOTER_CLASS}>{t("commandPalette.backHint")}</div>
  }

  const selected = items.find((item) => item.id === selectedId)
  const firstAction = selected?.disabledReason === null ? selected.actions?.[0] : undefined
  if (!firstAction) return null

  return (
    <div className={`${FOOTER_CLASS} flex items-center justify-end gap-4`}>
      <span className="flex items-center gap-1.5">
        {firstAction.label}
        <KbdGroup>
          <Kbd>{MOD_KEY_LABEL}</Kbd>
          <Kbd>↵</Kbd>
        </KbdGroup>
      </span>
      <span className="flex items-center gap-1.5">
        {t("commandPalette.actionsHint")}
        <KbdGroup>
          <Kbd>⇧</Kbd>
          <Kbd>↵</Kbd>
        </KbdGroup>
      </span>
    </div>
  )
}
