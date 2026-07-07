// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import type { FieldDisplayProps } from "../types"

/** Renders a repeater field as a localized "N items" summary rather than expanding its contents. */
export function RepeaterDisplay({ value }: FieldDisplayProps) {
  const { t } = useTranslation()
  const items = Array.isArray(value) ? value : []

  if (items.length === 0) {
    return <div className="text-muted-foreground">-</div>
  }

  return (
    <span className="text-sm text-muted-foreground">
      {t("fields.repeater.itemsCount", { count: items.length })}
    </span>
  )
}
