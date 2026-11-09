// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { X, Plus } from '@/components/icons'
import type { Branch, LayoutField } from '@beechcms/core'
import { ColumnShell } from '@/components/builder/column-shell'
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
import { getFullWidthWarningLabel, type LayoutBuilderActions } from './use-layout-builder'
import { dragIds } from './use-builder-dnd'

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
  /** The schema branch definition representing the field type and metadata. */
  readonly branch: Branch
  /** The layout builder actions. */
  readonly ops: LayoutBuilderActions
}

/**
 * FieldItem component.
 * Renders an individual draggable field item within a column in the layout builder.
 * Displays a sort handle, the field name preview, and a removal button.
 *
 * Draggable and droppable, not sortable: a field never moves while it is dragged (the column marks where it would
 * land), so there are no positions to recompute and nothing to animate. Memoised, so an edit elsewhere in the layout
 * does not redraw it; what dnd-kit redraws on its own is the block's box, as the ghost inside is memoised too.
 *
 * @param props - Component properties conforming to {@link FieldItemProps}.
 */
const FieldItem = React.memo(function FieldItem({ tabId, sectionId, columnId, branch, ops }: FieldItemProps) {
  const { t } = useTranslation()
  const id = dragIds.field(branch.id)
  const data = React.useMemo(() => ({ type: 'field', rootId: tabId, sectionId, columnId }), [tabId, sectionId, columnId])
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id, data })
  const { setNodeRef: setDropRef } = useDroppable({ id, data })
  const setNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  // No border of its own: the field is a flat block that shows a wash on hover, so a section reads as a
  // list of fields instead of boxes inside boxes.
  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="group/field relative flex min-w-0 max-w-full items-start gap-1 rounded-lg p-1.5 transition-colors hover:bg-muted/40"
    >
      {/* The whole left strip is the handle: a big target that does not compete with the field's content.
          Its look never changes on hover; only the cursor does. The icon sits at the strip's vertical centre. */}
      <button
        type="button"
        aria-label={t('layoutBuilder.dragHandle')}
        className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-control text-muted-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        aria-label={t('layoutBuilder.removeField')}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-status-danger-foreground focus-visible:opacity-100 group-hover/field:opacity-100"
        onClick={() => ops.clearField(tabId, sectionId, columnId, branch.id)}
      >
        <X />
      </Button>
    </div>
  )
})

// ============================================================================
// AddFieldMenu
// ============================================================================

/** Properties for the {@link AddFieldMenu} component. */
interface AddFieldMenuProps {
  readonly tabId: string
  readonly sectionId: string
  readonly columnId: string
  /** The fields the column holds, to name the full-width field in the way when an add is refused. */
  readonly fields: readonly LayoutField[]
  readonly branchById: Record<string, Branch>
  /** List of schema branches that are still available to be added. */
  readonly availableBranches: readonly Branch[]
  readonly ops: LayoutBuilderActions
}

/**
 * The Add field button and its searchable list. Memoised and kept apart from the column: the list is one item per
 * branch still free, in every column, and the column's own redraws (dnd-kit's, while a field is dragged) must not
 * rebuild it.
 */
const AddFieldMenu = React.memo(function AddFieldMenu({
  tabId,
  sectionId,
  columnId,
  fields,
  branchById,
  availableBranches,
  ops,
}: AddFieldMenuProps) {
  const { t: translate } = useTranslation()
  const [open, setOpen] = React.useState(false)
  // cmdk keeps the last highlighted item once the pointer leaves it; the highlight is cleared on leave.
  const [highlighted, setHighlighted] = React.useState('')

  function add(branch: Branch) {
    const isAssigned = ops.assignField(tabId, sectionId, columnId, branch.id)
    setOpen(false)
    if (!isAssigned) {
      // A full-width field always sits alone in a single-column section (the server refuses any other layout), so
      // the column's own fields are enough to tell which one is in the way.
      const label = getFullWidthWarningLabel(branch, { columns: [{ id: columnId, fields: [...fields] }] }, branchById)
      toast.warning(translate('layoutBuilder.warnFullWidth', { label }))
    }
  }

  return (
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
                  onSelect={() => add(branch)}
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
  )
})

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
  /** The layout builder actions. */
  readonly ops: LayoutBuilderActions
  /** Drag ID for the column itself (used when the column is dragged as a whole). */
  readonly dragId: string
  /** Whether the column can be dragged to swap places: false when it is its section's only column. */
  readonly reorderable?: boolean
}

/**
 * ColumnCard component.
 * Renders a column of the layout builder: the shared column frame holding the field items and a searchable
 * dropdown to add new fields. Memoised: its props keep their identity while other columns are edited or dragged into.
 *
 * @param props - Component properties conforming to {@link ColumnCardProps}.
 */
export const ColumnCard = React.memo(function ColumnCard({
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

  return (
    <ColumnShell
      column={{ rootId: tabId, sectionId, columnId }}
      dragId={dragId}
      zoneId={dragIds.zone(tabId, sectionId, columnId)}
      itemCount={fields.length}
      reorderable={reorderable}
      dragLabel={translate('layoutBuilder.dragColumn')}
      // As small and quiet as the strip beside a field, and unrelated to the dashboard builder's handle.
      handleClassName="-top-2 rounded-control px-2 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
      handleIconClassName="size-4 rotate-90"
      gap={0.5}
      footer={
        availableBranches.length > 0 ? (
          <AddFieldMenu
            tabId={tabId}
            sectionId={sectionId}
            columnId={columnId}
            fields={fields}
            branchById={branchById}
            availableBranches={availableBranches}
            ops={ops}
          />
        ) : null
      }
    >
      {fields.map((field) => {
        const branch = branchById[field.branchId]
        if (!branch) return null
        return (
          <FieldItem key={field.branchId} tabId={tabId} sectionId={sectionId} columnId={columnId} branch={branch} ops={ops} />
        )
      })}
    </ColumnShell>
  )
})
