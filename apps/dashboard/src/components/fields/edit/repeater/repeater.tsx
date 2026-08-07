// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { Plus } from 'reicon-react'
import type { Branch, Seed } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import type { FieldEditProps } from "../../types"
import { BranchItemRow } from "./repeater-branch-item"
import { GenericItemRow } from "./repeater-generic-item"

/**
 * Repeater-specific configuration read off `branch.repeater` (not part of the
 * generic {@link FieldEditProps}). Two shapes share this component:
 * - Seed Builder's "field list" editor (schema authoring: each item *is* a Branch).
 * - Content editing of a `repeater`-type field (each item is a data record whose
 *   shape is described by `fields`/`branch.fields`).
 */
interface RepeaterMeta {
  /** 'branch' → each item is itself a Branch definition, edited via BranchItemRow
   *  (used by the Seed Builder to let authors add/reorder sub-fields).
   *  'fields' → each item is a plain record edited via GenericItemRow, using
   *  `fields` as the sub-schema (used when editing content of a repeater field). */
  itemKind?: "branch" | "fields"
  /** Only for itemKind:'fields' — the sub-schema (leaf-type Branches) each item's record must satisfy. */
  fields?: Branch[]
  /** Optional UI label for the add button / empty state.                         */
  itemLabel?: string
  /** Context the branch-item editor needs (active seeds for relation targets).    */
  branchItemContext?: { activeSeedsForRelation: Seed[]; subField?: boolean }
}

/**
 * Editor for `repeater`-type fields: a reorderable, min/max-bounded list of items.
 *
 * `itemKind` (from `branch.repeater`, defaulting to "fields" for actual repeater
 * branches and "branch" otherwise — e.g. when reused by the Seed Builder to edit a
 * repeater's own sub-fields) decides whether each item is a nested Branch
 * definition (BranchItemRow) or a data record keyed by sub-field alias
 * (GenericItemRow). Drag-and-drop reordering uses dnd-kit; branch items are keyed
 * by their stable `branch.id` while generic items use a positional `item-{idx}`
 * id since plain records have no identity of their own.
 */
export function FieldEditRepeater({ branch, value, onChange }: FieldEditProps) {
  const { t } = useTranslation()
  const meta = ((branch as unknown as { repeater?: RepeaterMeta }).repeater) ?? {}
  const itemKind = meta.itemKind ?? (branch.type === "repeater" ? "fields" : "branch")
  const subFields = meta.fields ?? branch.fields ?? []
  const items: unknown[] = Array.isArray(value) ? value : []
  const dragIds = items.map((item, idx) => itemKind === "branch" ? (item as Branch).id : `item-${idx}`)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const maxItems = typeof branch.maxItems === "number" ? branch.maxItems : Infinity
  const minItems = typeof branch.minItems === "number" ? branch.minItems : 0
  const canAdd = items.length < maxItems
  const canRemove = items.length > minItems

  function update(index: number, next: unknown) {
    const copy = items.slice()
    copy[index] = next
    onChange(copy)
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = dragIds.indexOf(String(active.id))
    const toIndex = dragIds.indexOf(String(over.id))
    if (fromIndex === -1 || toIndex === -1) return
    onChange(arrayMove(items, fromIndex, toIndex))
  }
  function add() {
    if (!canAdd) return
    if (itemKind === "branch") {
      const blank: Branch = { id: `br_new_${Date.now()}`, alias: "", label: "", type: "text" }
      onChange([...items, blank])
      return
    }
    // Generic item — seed a record with empty values per sub-branch.
    const blank: Record<string, unknown> = {}
    for (const f of subFields) blank[f.alias] = f.type === "boolean" ? false : ""
    onChange([...items, blank])
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("fields.repeater.emptyState")}</p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={dragIds} strategy={verticalListSortingStrategy}>
          {items.map((item, idx) => (
            itemKind === "branch" ? (
              <BranchItemRow
                key={(item as Branch).id ?? idx}
                branch={item as Branch}
                activeSeedsForRelation={meta.branchItemContext?.activeSeedsForRelation ?? []}
                subField={meta.branchItemContext?.subField}
                onChange={(b) => update(idx, b)}
                onRemove={() => remove(idx)}
                disableRemove={!canRemove}
              />
            ) : (
              <GenericItemRow
                key={dragIds[idx]}
                id={dragIds[idx]}
                subBranches={subFields}
                value={item as Record<string, unknown>}
                onChange={(next) => update(idx, next)}
                onRemove={() => remove(idx)}
                disableRemove={!canRemove}
              />
            )
          ))}
        </SortableContext>
      </DndContext>
      {!(maxItems === 1 && items.length === 1) && (
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!canAdd} className="w-full">
          <Plus className="mr-1 size-4" />
          {meta.itemLabel ?? t("fields.repeater.addItem")}
        </Button>
      )}
    </div>
  )
}
