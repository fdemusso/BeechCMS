// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { GripDots } from '@/components/ui/grip-dots'
import { BuilderDragContext, type ColumnRef } from './layout-dnd'

export interface ColumnShellProps {
  readonly column: ColumnRef
  /** The column's own drag id, and the id of its drop zone. */
  readonly dragId: string
  readonly zoneId: string
  /** How many items the column holds. */
  readonly itemCount: number
  /** Whether the column can be dragged to swap places: false when it is its section's only column. */
  readonly reorderable: boolean
  readonly dragLabel: string
  /**
   * The look of the column's top handle: its offset, padding, corners, border and colour. The shell only keeps what
   * makes it a handle (centred, revealed on hover or focus), so each builder sets its own size and style.
   */
  readonly handleClassName: string
  /** The grip icon inside the handle: its size and rotation. */
  readonly handleIconClassName: string
  /** Spacing between the items, in Tailwind spacing steps (`3` is `gap-3`, `0.5` is `gap-0.5`). */
  readonly gap: number
  readonly style?: React.CSSProperties
  /** The items. */
  readonly children: React.ReactNode
  /** What follows the items: the add button. */
  readonly footer: React.ReactNode
}

/**
 * The marker goes between the items, where the dragged one would land. It takes no room of its own: it sits
 * between two flex gaps, and a negative margin of half a gap on each side cancels both.
 */
function DropMarker({ gap }: { readonly gap: number }) {
  return (
    <div aria-hidden className="relative h-0" style={{ marginBlock: `calc(var(--spacing, 0.25rem) * ${-gap / 2})` }}>
      <div className="absolute inset-x-1 top-0 h-[3px] -translate-y-1/2 rounded-full bg-foreground/40" />
    </div>
  )
}

/**
 * The frame of a column in a layout builder: sortable as a whole, a drop zone over its body, and the outline
 * language of the drop areas. Borderless at rest; outlined only while it has nothing in it (so there is
 * somewhere to click) or while an item is being dragged (so there is somewhere to drop). An empty column holds
 * only the add button, centred with a margin so its hover does not touch the outline.
 *
 * Shared by the entry builder and the dashboard builder.
 */
export function ColumnShell({
  column,
  dragId,
  zoneId,
  itemCount,
  reorderable,
  dragLabel,
  handleClassName,
  handleIconClassName,
  gap,
  style,
  children,
  footer,
}: Readonly<ColumnShellProps>) {
  const { draggingItem, activeColumnKey, dropIndex } = React.useContext(BuilderDragContext)
  // An item cannot land on a column (it lands on the zone or on another item), so while one is dragged the column
  // stops being a droppable: dnd-kit has one rect less to measure and one less candidate on every pass.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
    data: { type: 'column' },
    disabled: draggingItem ? { droppable: true } : undefined,
  })
  const { setNodeRef: setZoneRef } = useDroppable({ id: zoneId, data: { type: 'zone', ...column } })
  const isActiveColumn = draggingItem && activeColumnKey === `${column.rootId}:${column.sectionId}:${column.columnId}`
  const empty = itemCount === 0

  const items = React.Children.toArray(children)
  if (isActiveColumn && dropIndex !== null) {
    items.splice(Math.min(dropIndex, items.length), 0, <DropMarker key="drop-marker" gap={gap} />)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, ...style }}
      className={cn(
        'group/column relative flex min-h-[48px] min-w-0 max-w-full flex-col rounded-lg border border-transparent transition-colors',
        // Dragging an item: every column gets a thin solid outline, the one under it a darker grey and a faint fill.
        (empty || draggingItem) && 'border-border',
        isActiveColumn && 'border-foreground/25 bg-muted/50',
      )}
    >
      {reorderable && (
        <button
          type="button"
          aria-label={dragLabel}
          className={cn(
            'absolute left-1/2 z-10 -translate-x-1/2 cursor-grab touch-none opacity-0 transition-opacity focus-visible:opacity-100 group-hover/column:opacity-100',
            handleClassName,
          )}
          {...attributes}
          {...listeners}
        >
          <GripDots className={handleIconClassName} />
        </button>
      )}

      {/* The zone fills the column's inside (its 48px minimum already includes the border). */}
      <div
        ref={setZoneRef}
        className={cn('flex flex-1 flex-col', empty && 'justify-center p-1.5')}
        style={{ gap: `calc(var(--spacing, 0.25rem) * ${gap})` }}
      >
        {items}
        {footer}
      </div>
    </div>
  )
}
