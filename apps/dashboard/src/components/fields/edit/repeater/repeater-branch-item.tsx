// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Trash2, ChevronDown, ChevronUp, SortV as GripVertical, InfoCircle as Info } from '@/components/icons'
import type { Branch, BranchType, Seed } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  RelationOptionsForm,
  NumberOptionsForm,
  FileOptionsForm,
  RepeaterOptionsForm,
  PoliciesOptionsForm,
  LocalizedOptionsForm,
  TagOptionsForm,
} from "./repeater-branch-options"
import { withoutIneligibleLocalized } from "./repeater-localization"
import { withoutIneligibleTagOptions } from "./repeater-tag-options"

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

/**
 * Column names owned by the CMS itself (primary key, status, timestamps, etc.).
 * Exported so alias inputs elsewhere can be validated against picking one of
 * these as a custom field alias, since they'd collide with a real SQL column.
 */
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
  /** Whether the parent table has no entries (allowing unrestricted classification). */
  tableEmpty?: boolean
}

/** Properties for {@link BranchEditorForm}. */
export interface BranchEditorFormProps {
  /** The branch schema metadata being edited. */
  branch: Branch
  /** Active seeds that can be chosen for relation targets. */
  activeSeedsForRelation: Seed[]
  onChange: (updated: Branch) => void
  /** Repeater sub-field: not a SQL column, so alias/type stay editable and policies are hidden. */
  subField?: boolean
  /** Whether the parent table has no entries (allowing unrestricted classification). */
  tableEmpty?: boolean
  /** Opens the content-language settings; makes the Localized hint a link. */
  onOpenLanguages?: () => void
  /** Opens the Danger zone; makes the info icon of a stored field's alias and type a link to it. */
  onOpenDangerZone?: () => void
}

/**
 * The "why is this read-only" icon of a stored field's alias or type. It is the tooltip's own trigger, so it shows on
 * keyboard focus as well as on hover; with `onOpen` it is a button that goes to where the change is made.
 */
function LockedHint({ hint, onOpen }: { hint: string; onOpen?: () => void }) {
  const icon = <Info aria-hidden className="h-3 w-3" />
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label={hint}
              className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {icon}
            </button>
          ) : (
            <span tabIndex={0} role="img" aria-label={hint} className="shrink-0 rounded-full text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
              {icon}
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * The editing form of a single branch (alias, type, label, requirement, hint and the type-specific
 * options). Shared by the collapsible {@link BranchItemRow} and the Seed Builder's field panel.
 */
export function BranchEditorForm({
  branch,
  activeSeedsForRelation,
  onChange,
  subField = false,
  tableEmpty,
  onOpenLanguages,
  onOpenDangerZone,
}: BranchEditorFormProps) {
  const { t } = useTranslation()
  const uid = useId()
  // Once a top-level branch is persisted (id no longer has the "br_new_" prefix
  // assigned on creation), alias/type are locked: renaming/retyping would orphan
  // the underlying SQL column. Sub-fields (subField) never get this lock since
  // they live in a JSON blob and can be freely redefined.
  const isExisting = !subField && !branch.id.startsWith("br_new_")
  const typeOptions = subField ? LEAF_BRANCH_TYPES : BRANCH_TYPES

  // A type or classification change must never leave `localized: true` where seed validation refuses it (Fatal 17).
  function emitChange(updated: Branch) {
    onChange(withoutIneligibleTagOptions(withoutIneligibleLocalized(updated, subField)))
  }

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    emitChange({ ...branch, [key]: value })
  }

  // "Required" drives both flags. On a stored column it is locked: NOT NULL is part of the table definition.
  const isRequired = branch.requiredOnCreate === true && branch.requiredOnUpdate === true
  function setRequired(required: boolean) {
    const next: Branch = { ...branch }
    if (required) {
      next.requiredOnCreate = true
      next.requiredOnUpdate = true
    } else {
      delete next.requiredOnCreate
      delete next.requiredOnUpdate
    }
    emitChange(next)
  }

  return (
    <div className="space-y-3">
      {/* Alias */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-alias`} className="text-xs">{t("seedBuilder.branchEditor.alias")}</Label>
          {isExisting ? (
            <div className="flex items-center gap-1">
              <Input
                id={`${uid}-alias`}
                value={branch.alias}
                readOnly
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
              <LockedHint hint={t("seedBuilder.branchEditor.aliasReadOnlyHint")} onOpen={onOpenDangerZone} />
            </div>
          ) : (
            <Input
              id={`${uid}-alias`}
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
          <Label htmlFor={`${uid}-type`} className="text-xs">{t("seedBuilder.branchEditor.type")}</Label>
          {isExisting ? (
            <div className="flex items-center gap-1">
              <Input
                id={`${uid}-type`}
                value={branch.type}
                readOnly
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
              <LockedHint hint={t("seedBuilder.branchEditor.typeReadOnlyHint")} onOpen={onOpenDangerZone} />
            </div>
          ) : (
            <Select value={branch.type} onValueChange={(v) => set("type", v as BranchType)}>
              <SelectTrigger id={`${uid}-type`}>
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
        <Label htmlFor={`${uid}-label`} className="text-xs">{t("seedBuilder.branchEditor.label")}</Label>
        <Input
          id={`${uid}-label`}
          value={branch.label}
          onChange={(e) => set("label", e.target.value)}
          placeholder={t("seedBuilder.branchEditor.labelPlaceholder")}
        />
      </div>

      {/* Hint */}
      <div className="space-y-1">
        <Label htmlFor={`${uid}-hint`} className="text-xs">{t("seedBuilder.branchEditor.hint")}</Label>
        <Input
          id={`${uid}-hint`}
          value={branch.hint ?? ""}
          onChange={(e) => set("hint", e.target.value || undefined)}
          placeholder={t("seedBuilder.branchEditor.hintPlaceholder")}
        />
      </div>

      {/* Required: locked on a stored column, where NOT NULL is part of the table */}
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Label htmlFor={`required-${branch.id}`} className="text-xs">{t("seedBuilder.branchEditor.required")}</Label>
        <Switch
          id={`required-${branch.id}`}
          checked={isRequired}
          disabled={isExisting}
          onCheckedChange={setRequired}
        />
      </div>

      <LocalizedOptionsForm
        branch={branch}
        onChange={emitChange}
        subField={subField}
        isExisting={isExisting}
        tableEmpty={tableEmpty}
        onOpenLanguages={onOpenLanguages}
      />

      {/* Type-specific sub-forms */}
      {branch.type === "relation" && (
        <RelationOptionsForm
          branch={branch}
          activeSeedsForRelation={activeSeedsForRelation}
          onChange={emitChange}
        />
      )}

      {branch.type === "number" && <NumberOptionsForm branch={branch} onChange={emitChange} />}

      {branch.type === "file" && <FileOptionsForm branch={branch} onChange={emitChange} />}

      {branch.type === "tags" && <TagOptionsForm branch={branch} onChange={emitChange} />}

      {branch.type === "repeater" && (
        <RepeaterOptionsForm branch={branch} onChange={emitChange} subField={subField} />
      )}

      {/* Policies — sub-fields live inside a JSON blob, not a SQL column */}
      <PoliciesOptionsForm
        branch={branch}
        onChange={emitChange}
        subField={subField}
        tableEmpty={tableEmpty}
      />
    </div>
  )
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
  tableEmpty,
}: BranchItemRowProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: branch.id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <Collapsible
      ref={setNodeRef}
      style={style}
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-background"
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
            {branch.localized === true && (
              <Badge variant="outline" className="text-xs">{t("seedBuilder.branchEditor.localizedBadge")}</Badge>
            )}
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
          <Trash2 className="h-4 w-4 text-status-danger-foreground" />
        </Button>
      </div>

      <CollapsibleContent>
        <Separator />
        <div className="p-3">
          <BranchEditorForm
            branch={branch}
            activeSeedsForRelation={activeSeedsForRelation}
            onChange={onChange}
            subField={subField}
            tableEmpty={tableEmpty}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
