// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SortV as GripVertical, X, Plus } from 'reicon-react'
import type { Branch, LayoutField } from '@beechcms/core'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { FieldEdit } from '@/components/fields'
import type { UseLayoutBuilderResult } from './use-layout-builder'

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
 * Returns a default mock value for schema fields based on their type,
 * used for rendering inactive field previews in the layout builder.
 *
 * @param branch - The schema branch definition.
 * @returns A placeholder default value.
 */
function emptyValue(branch: Branch): unknown {
  if (branch.type === 'boolean') return false
  if (branch.type === 'richtext') return { type: 'doc', content: [{ type: 'paragraph' }] }
  return ''
}

/**
 * FieldItem component.
 * Renders an individual draggable field item within a column in the layout builder.
 * Displays a sort handle, the field name preview, and a removal button.
 *
 * @param props - Component properties conforming to {@link FieldItemProps}.
 */
function FieldItem({ tabId, sectionId, columnId, field, branch, ops, dragId }: FieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded border group">
      <div className="flex items-start gap-2 p-2">
        <button
          type="button"
          className="mt-1 flex-shrink-0 cursor-grab text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="flex-1 min-w-0 space-y-1.5 pointer-events-none select-none opacity-70">
          <Label className="text-xs font-medium">{branch.label}</Label>
          <FieldEdit branch={branch as any} value={emptyValue(branch)} onChange={() => {}} />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => ops.clearField(tabId, sectionId, columnId, field.branchId)}
        >
          <X className="size-3" />
        </Button>
      </div>
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
}: ColumnCardProps) {
  const { t: translate } = useTranslation()
  const [open, setOpen] = React.useState(false)

  // The column itself is sortable (for column reordering)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const fieldDragIds = fields.map((field) => `field:${tabId}:${sectionId}:${columnId}:${field.branchId}`)

  return (
    <div ref={setNodeRef} style={style} className="rounded border min-h-[48px] flex flex-col gap-1 p-1">
      {/* Column drag handle — top strip */}
      <div className="flex justify-center">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground rotate-90"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </div>

      {/* Field items */}
      <SortableContext items={fieldDragIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1">
          {fields.map((field) => {
            const branch = branchById[field.branchId]
            if (!branch) return null
            const fieldDragId = `field:${tabId}:${sectionId}:${columnId}:${field.branchId}`
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
              className="w-full justify-center text-muted-foreground border-dashed border h-8 mt-1"
            >
              <Plus className="size-3 mr-1" />
              {translate('layoutBuilder.addField')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="p-0 w-64" align="start">
            <Command>
              <CommandInput placeholder={translate('layoutBuilder.searchFields')} />
              <CommandList>
                <CommandEmpty>{translate('layoutBuilder.noFields')}</CommandEmpty>
                {availableBranches.map((branch) => (
                  <CommandItem
                    key={branch.id}
                    value={branch.label}
                    onSelect={() => {
                      const isAssigned = ops.assignField(tabId, sectionId, columnId, branch.id)
                      if (isAssigned) setOpen(false)
                    }}
                  >
                    <span>{branch.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{branch.type}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
