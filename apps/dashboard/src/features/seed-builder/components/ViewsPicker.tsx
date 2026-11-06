// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { AUTHORIZABLE_VIEWS } from "@beechcms/core"
import type { DashboardView } from "@beechcms/core"
import { Checkbox } from "@/components/ui/checkbox"
import { VIEW_TYPE_CATALOGUE } from "@/features/content-toolbar"
import type { ViewTypeId } from "@/features/shared"
import { cn } from "@/lib/utils"
import { VIEW_GROUPS } from "../lib/dashboard-views"

export interface ViewsPickerProps {
  /** The implemented views the content type authorizes. */
  selected: readonly DashboardView[]
  onToggle: (view: DashboardView, checked: boolean) => void
}

const isImplemented = (type: ViewTypeId): type is DashboardView =>
  (AUTHORIZABLE_VIEWS as readonly string[]).includes(type)

/**
 * Every view type of the content manager, grouped by purpose. The table is always on, the ones not built yet are
 * shown switched off so it is clear what is coming.
 */
export function ViewsPicker({ selected, onToggle }: ViewsPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
      {VIEW_GROUPS.map((group) => (
        <fieldset key={group.id} className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">
            {t(`seedBuilder.editor.viewGroups.${group.id}`)}
          </legend>
          {group.types.map((type) => {
            const entry = VIEW_TYPE_CATALOGUE.find((candidate) => candidate.type === type)
            if (!entry) return null
            const implemented = isImplemented(type)
            const locked = type === "table"
            const Icon = entry.Icon
            const disabled = !implemented || locked
            return (
              <label
                key={type}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  disabled ? "cursor-not-allowed" : "cursor-pointer",
                  !implemented && "text-muted-foreground"
                )}
              >
                <Checkbox
                  checked={locked || (implemented && selected.includes(type))}
                  disabled={disabled}
                  onCheckedChange={(checked) => implemented && onToggle(type, checked === true)}
                />
                <Icon className="size-4 shrink-0" />
                {t(entry.labelKey)}
              </label>
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}
