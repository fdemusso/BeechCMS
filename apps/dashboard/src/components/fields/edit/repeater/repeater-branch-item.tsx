// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Trash2, ChevronDown, ChevronUp, GripVertical, Info } from "lucide-react"
import type { Branch, BranchType, Seed } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import {
  RelationOptionsForm,
  NumberOptionsForm,
  FileOptionsForm,
  RepeaterOptionsForm,
  TagsOptionsForm,
  PoliciesOptionsForm,
} from "./repeater-branch-options"

/** Full list of all registered BranchTypes. */
const BRANCH_TYPES: BranchType[] = [
  "text",
  "richtext",
  "number",
  "boolean",
  "date",
  "json",
  "tags",
  "file",
  "relation",
  "repeater",
]

/** Repeater sub-fields are restricted to leaf/scalar types (depth capped at 1). */
const LEAF_BRANCH_TYPES: BranchType[] = [
  "text",
  "richtext",
  "number",
  "boolean",
  "date",
  "json",
  "tags",
]

/** List of fields reserved for automation and internal purposes. */
export const AUTOMATION_RESERVED = new Set([
  "id",
  "slug",
  "status",
  "created_at",
  "updated_at",
  "schema_slug",
])

/**
 * Properties for the {@link BranchItemRow} component.
 */
export interface BranchItemRowProps {
  /** The branch schema metadata being edited. */
  branch: Branch
  /** Active seeds that can be chosen for relation targets. */
  activeSeedsForRelation: Seed[]
  /** Callback fired when any branch details change. */
  onChange: (updated: Branch) => void
  /** Callback to request removal of this branch. */
  onRemove: () => void
  /**
   * If true, this row represents a repeater sub-field.
   * Subfields are not SQL columns: alias/type remain editable and policies are hidden.
   */
  subField?: boolean
  /** Disable the remove button (e.g. minItems constraints). */
  disableRemove?: boolean
}

/**
 * A draggable, collapsible row component representing a single schema branch (field)
 * within the Seed Builder or Repeater Builder.
 */
export function BranchItemRow({
  branch,
  activeSeedsForRelation,
  onChange,
  onRemove,
  subField = false,
  disableRemove = false,
}: BranchItemRowProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const isExisting = !subField && !branch.id.startsWith("br_new_")
  const typeOptions = subField ? LEAF_BRANCH_TYPES : BRANCH_TYPES
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: branch.id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    onChange({ ...branch, [key]: value })
  }

  return (
    <Collapsible
      ref={setNodeRef}
      style={style}
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border bg-background"
    >
      <div className="flex items-center gap-2 p-3">
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium truncate">
              {branch.alias || t("seedBuilder.branchEditor.newField")}
            </span>
            <Badge variant="secondary" className="text-xs">
              {branch.type}
            </Badge>
          </div>
          {branch.label && <p className="text-xs text-muted-foreground truncate">{branch.label}</p>}
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disableRemove}
          title={t("fields.repeater.removeItem")}
          aria-label={t("fields.repeater.removeItem")}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <CollapsibleContent>
        <Separator />
        <div className="p-3 space-y-3">
          {/* Alias */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("seedBuilder.branchEditor.alias")}</Label>
              {isExisting ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1">
                        <Input
                          value={branch.alias}
                          readOnly
                          className="bg-muted text-muted-foreground cursor-not-allowed"
                        />
                        <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{t("seedBuilder.branchEditor.aliasReadOnlyHint")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Input
                  value={branch.alias}
                  onChange={(e) =>
                    set("alias", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                  }
                  placeholder="field_name"
                  pattern="^[a-z0-9_]+$"
                />
              )}
            </div>

            {/* Type */}
            <div className="space-y-1">
              <Label className="text-xs">{t("seedBuilder.branchEditor.type")}</Label>
              {isExisting ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1">
                        <Input
                          value={branch.type}
                          readOnly
                          className="bg-muted text-muted-foreground cursor-not-allowed"
                        />
                        <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{t("seedBuilder.branchEditor.typeReadOnlyHint")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Select value={branch.type} onValueChange={(v) => set("type", v as BranchType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((bt) => (
                      <SelectItem key={bt} value={bt}>
                        {t(`seedBuilder.fieldTypes.${bt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1">
            <Label className="text-xs">{t("seedBuilder.branchEditor.label")}</Label>
            <Input
              value={branch.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder={t("seedBuilder.branchEditor.labelPlaceholder")}
            />
          </div>

          {/* Type-specific sub-forms */}
          {branch.type === "relation" && (
            <RelationOptionsForm
              branch={branch}
              activeSeedsForRelation={activeSeedsForRelation}
              onChange={onChange}
            />
          )}

          {branch.type === "number" && <NumberOptionsForm branch={branch} onChange={onChange} />}

          {branch.type === "file" && <FileOptionsForm branch={branch} onChange={onChange} />}

          {branch.type === "repeater" && (
            <RepeaterOptionsForm branch={branch} onChange={onChange} subField={subField} />
          )}

          {(branch.type === "tags" || branch.type === "json") && (
            <TagsOptionsForm branch={branch} onChange={onChange} />
          )}

          {/* Policies — sub-fields live inside a JSON blob, not a SQL column */}
          <PoliciesOptionsForm branch={branch} onChange={onChange} subField={subField} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
