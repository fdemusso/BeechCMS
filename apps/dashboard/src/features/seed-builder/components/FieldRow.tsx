// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Branch } from "@beechcms/core"
import { Trash2 } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { GripDots } from "@/components/ui/grip-dots"
import { IconBadgeGroup } from "@/components/ui/icon-badge"
import { cn } from "@/lib/utils"
import type { BranchIssue } from "../lib/field-alias"
import { fieldBadges } from "../lib/field-badges"
import { FIELD_TYPE_ICONS } from "../lib/field-types"

export interface FieldRowProps {
  branch: Branch
  selected: boolean
  /** Why the field is incomplete, if it is. */
  issue: BranchIssue | null
  /** A stored field cannot be removed here: dropping a column is a Danger Zone operation. */
  removable: boolean
  onSelect: () => void
  onRemove: () => void
}

/** One field of the list: type icon, name, and badges for what matters (required, privacy, language). */
export function FieldRow({ branch, selected, issue, removable, onSelect, onRemove }: FieldRowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: branch.id })

  const TypeIcon = FIELD_TYPE_ICONS[branch.type]
  const badges = fieldBadges(branch, t)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={cn(
        "group flex items-center gap-1 rounded-control border bg-card pr-1 transition-colors",
        selected ? "border-primary/60 bg-accent" : "hover:bg-accent/60",
        issue && "border-destructive/50"
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none self-stretch px-2 text-muted-foreground hover:text-foreground"
        aria-label={t("fields.repeater.dragHandle")}
        {...attributes}
        {...listeners}
      >
        <GripDots className="size-3.5" />
      </button>

      <button
        type="button"
        data-field-row=""
        aria-current={selected}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-control py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {branch.label || branch.alias || t("seedBuilder.branchEditor.newField")}
        </span>
        <IconBadgeGroup items={badges} moreLabel={(count) => t("rbac.roles.moreRoles", "+{{count}} more", { count })} />
      </button>

      {issue && (
        <span className="shrink-0 text-xs text-destructive">{t(`seedBuilder.branchEditor.issues.${issue}`)}</span>
      )}

      {/* The bin takes room only on hover: the badges make way for it. */}
      {removable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={t("fields.repeater.removeItem")}
          className="w-0 shrink-0 overflow-hidden text-muted-foreground opacity-0 transition-all duration-200 hover:text-destructive focus-visible:w-8 focus-visible:opacity-100 group-hover:w-8 group-hover:opacity-100"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  )
}
