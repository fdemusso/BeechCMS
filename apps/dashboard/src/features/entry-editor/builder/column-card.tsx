// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X, Plus } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { Branch, LayoutField } from '@beechcms/core'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { toast } from 'sonner'
import { GripDots } from '@/components/ui/grip-dots'
import { FieldBlock } from './field-block'
import { getFullWidthWarningLabel, type UseLayoutBuilderResult } from './use-layout-builder'
import { BuilderDragContext, dragIds } from './use-builder-dnd'

// ============================================================================
// FieldItem
// ============================================================================

/** Properties for the {@link FieldItem} component. */
interface FieldItemProps {
  /** The unique ID of the tab this field belongs to. */
  readonly tabId: string
  /** The unique ID of the section this field belongs to. */
  readonly sectionId: string
  /** The unique ID of the column this field belongs to. */
  readonly columnId: string
  /** The layout field structure containing branch mapping. */
  readonly field: LayoutField
  /** The schema branch definition representing the field type and metadata. */
  readonly branch: Branch
  /** The layout builder operations. */
  readonly ops: UseLayoutBuilderResult
  /** The unique drag identifier used by dnd-kit. */
  readonly dragId: string
}

/**
 * FieldItem component.
 * Renders an individual draggable field item within a column in the layout builder.
 * Displays a sort handle, the field name preview, and a removal button.
 *
 * @param props - Component properties conforming to {@link FieldItemProps}.
 */
function FieldItem({ tabId, sectionId, columnId, field, branch, ops, dragId }: FieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
    data: { type: 'field', tabId, sectionId, columnId },
  })
  const { t: translate } = useTranslation()

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // No border of its own: the field is a flat block that shows a wash on hover, so a section reads as a
  // list of fields instead of boxes inside boxes.
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/field relative flex min-w-0 max-w-full items-start gap-1 rounded-lg p-1.5 transition-colors hover:bg-muted/40"
    >
      {/* The whole left strip is the handle: a big target that does not compete with the field's content.
          Its look never changes on hover; only the cursor does. The icon sits at the strip's vertical centre. */}
      <button
        type="button"
        aria-label={translate('layoutBuilder.dragHandle')}
        className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-md text-muted-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...attributes}
        {...listeners}
      >
        <GripDots className="size-4" />
      </button>

      <FieldBlock branch={branch} />

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={translate('layoutBuilder.removeField')}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/field:opacity-100"
        onClick={() => ops.clearField(tabId, sectionId, columnId, field.branchId)}
      >
        <X />
      </Button>
    </div>
  )
}

// ============================================================================
// ColumnCard
// ============================================================================

/** Properties for the {@link ColumnCard} component. */
interface ColumnCardProps {
  /** The unique ID of the tab this column belongs to. */
  readonly tabId: string
  /** The unique ID of the section this column belongs to. */
  readonly sectionId: string
  /** The unique ID of the column. */
  readonly columnId: string
  /** The list of layout fields currently assigned to this column. */
  readonly fields: LayoutField[]
  /** Map of schema branch definitions indexed by their branch ID. */
  readonly branchById: Record<string, Branch>
  /** List of schema branches that are still available to be added. */
  readonly availableBranches: Branch[]
  /** The layout builder operations. */
  readonly ops: UseLayoutBuilderResult
  /** Drag ID for the column itself (used when the column is dragged as a whole). */
  readonly dragId: string
  /** Whether the column can be dragged to swap places: false when it is its section's only column. */
  readonly reorderable?: boolean
}

/**
 * ColumnCard component.
 * Renders a column container in the layout builder. Supports sortable children fields
 * and presents a searchable dropdown to add new fields.
 *
 * @param props - Component properties conforming to {@link ColumnCardProps}.
 */
export function ColumnCard({
  tabId,
  sectionId,
  columnId,
  fields,
  branchById,
  availableBranches,
  ops,
  dragId,
  reorderable = true,
}: ColumnCardProps) {
  const { t: translate } = useTranslation()
  const [open, setOpen] = React.useState(false)
  // cmdk keeps the last highlighted item once the pointer leaves it; the highlight is cleared on leave.
  const [highlighted, setHighlighted] = React.useState('')

  // The column itself is sortable (for column reordering)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
    data: { type: 'column' },
  })

  // Its body is also a drop zone, so a field can land in a column that has no field to drop on.
  const { setNodeRef: setZoneRef } = useDroppable({
    id: dragIds.zone(tabId, sectionId, columnId),
    data: { type: 'zone', tabId, sectionId, columnId },
  })
  const { draggingField, activeColumnKey } = React.useContext(BuilderDragContext)
  const isActiveColumn = draggingField && activeColumnKey === `${tabId}:${sectionId}:${columnId}`

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const fieldDragIds = fields.map((field) => dragIds.field(field.branchId))

  return (
    <div
      ref={setNodeRef}
      style={style}
      // Borderless: the column is only outlined while it has nothing in it, so there is a visible place to
      // add or drop a field. Otherwise the section's own border is the only frame.
      className={cn(
        'group/column relative flex min-h-[48px] min-w-0 max-w-full flex-col gap-0.5 rounded-lg border border-transparent transition-colors',
        // Dragging a field: every column gets a thin solid outline, the one under it a darker grey and a faint fill.
        (fields.length === 0 || draggingField) && 'border-border',
        isActiveColumn && 'border-foreground/25 bg-muted/50',
      )}
    >
      {/* Column drag handle: only offered when there is a sibling column to swap with, and only on hover. */}
      {reorderable && (
        <button
          type="button"
          aria-label={translate('layoutBuilder.dragColumn')}
          className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 cursor-grab touch-none rounded-md px-2 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover/column:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripDots className="size-4 rotate-90" />
        </button>
      )}

      {/* Field items; the whole body is the drop zone */}
      {/* The zone fills the column's inside (its 48px minimum already includes the border). An empty column
          holds only the Add Field button, which gets a margin so its hover does not touch the outline. */}
      <div ref={setZoneRef} className={cn('flex flex-1 flex-col gap-0.5', fields.length === 0 && 'justify-center p-1.5')}>
      <SortableContext items={fieldDragIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-0.5">
          {fields.map((field) => {
            const branch = branchById[field.branchId]
            if (!branch) return null
            const fieldDragId = dragIds.field(field.branchId)
            return (
              <FieldItem
                key={field.branchId}
                tabId={tabId}
                sectionId={sectionId}
                columnId={columnId}
                field={field}
                branch={branch}
                ops={ops}
                dragId={fieldDragId}
              />
            )
          })}
        </div>
      </SortableContext>

      {/* Add Field */}
      {availableBranches.length > 0 && (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
            >
              <Plus className="size-3 mr-1" />
              {translate('layoutBuilder.addField')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="p-0 w-64" align="start">
            <Command value={highlighted} onValueChange={setHighlighted}>
              <CommandInput placeholder={translate('layoutBuilder.searchFields')} />
              <CommandList onMouseLeave={() => setHighlighted('')}>
                <CommandEmpty>{translate('layoutBuilder.noFields')}</CommandEmpty>
                {/* The group supplies the list's padding; bare items sit flush against the search box. */}
                <CommandGroup>
                {availableBranches.map((branch) => (
                  <CommandItem
                    key={branch.id}
                    value={branch.label}
                    // The item's built-in check mark is unused here and would keep the type off the right edge.
                    className="[&>svg]:hidden"
                    onSelect={() => {
                      const isAssigned = ops.assignField(tabId, sectionId, columnId, branch.id)
                      setOpen(false)
                      if (!isAssigned) {
                        const targetSection = ops.draft.tabs
                          .find((t) => t.id === tabId)
                          ?.sections.find((s) => s.id === sectionId)
                        const label = getFullWidthWarningLabel(branch, targetSection, branchById)
                        toast.warning(translate('layoutBuilder.warnFullWidth', { label }))
                      }
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{branch.label}</span>
                    <span className="text-muted-foreground text-xs">{branch.type}</span>
                  </CommandItem>
                ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      </div>
    </div>
  )
}
