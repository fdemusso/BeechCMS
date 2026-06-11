// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2 } from "lucide-react"
import type { Branch, BranchType } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { getEditComponent } from "../registry"

// Repeater sub-fields are restricted to leaf/scalar types — no nested `repeater`,
// `relation`, or `file` (mirrors packages/core/src/validation.ts).
const REPEATER_DISALLOWED_SUBTYPES = new Set<BranchType>(["repeater", "relation", "file"])

export interface GenericItemRowProps {
  id: string
  subBranches: Branch[]
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  onRemove: () => void
  disableRemove?: boolean
}

export function GenericItemRow({ id, subBranches, value, onChange, onRemove, disableRemove = false }: GenericItemRowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const fields = subBranches.filter(sub => !REPEATER_DISALLOWED_SUBTYPES.has(sub.type))

  function setField(alias: string, fieldValue: unknown) {
    onChange({ ...value, [alias]: fieldValue })
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border bg-background p-3 space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
          title={t("fields.repeater.dragHandle")}
          aria-label={t("fields.repeater.dragHandle")}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex-1 text-xs font-medium text-muted-foreground">{t("fields.repeater.item")}</span>
        <Button variant="ghost" size="sm" onClick={onRemove} disabled={disableRemove} title={t("fields.repeater.removeItem")} aria-label={t("fields.repeater.removeItem")}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="space-y-2">
        {fields.map(sub => {
          const FieldEdit = getEditComponent(sub.type)
          return (
            <div key={sub.id} className="space-y-1">
              <Label className="text-xs">{sub.label || sub.alias}</Label>
              <FieldEdit branch={sub} value={value[sub.alias]} onChange={v => setField(sub.alias, v)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
