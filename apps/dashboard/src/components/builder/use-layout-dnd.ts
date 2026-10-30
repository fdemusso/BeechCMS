// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { kindOf, sameColumn, useBuilderDragState, type ColumnRef, type ItemLocation } from './layout-dnd'

/** What a builder tells the shared drag logic about its own layout. Everything item-specific lives here. */
export interface LayoutDndAdapter<TLayout, TPreview> {
  /** The id prefix of the root (`tab`, `page`) and of the item (`field`, `widget`). */
  readonly rootKind: string
  readonly itemKind: string
  readonly draft: TLayout
  locateItem(layout: TLayout, itemId: string): ItemLocation | null
  columnItemCount(layout: TLayout, column: ColumnRef): number
  sectionIds(layout: TLayout, rootId: string): readonly string[] | undefined
  columnIds(layout: TLayout, rootId: string, sectionId: string): readonly string[] | undefined
  rootIds(layout: TLayout): readonly string[]
  /** What the overlay draws for the dragged id, whatever its kind. */
  buildPreview(layout: TLayout, id: string, width: number): TPreview
  moveItem(args: { from: ItemLocation & { itemId: string }; to: ColumnRef & { index: number } }): boolean
  reorderItems(column: ColumnRef, fromIndex: number, toIndex: number): void
  reorderSections(rootId: string, fromIndex: number, toIndex: number): void
  reorderColumns(rootId: string, sectionId: string, fromIndex: number, toIndex: number): void
  reorderRoots(fromIndex: number, toIndex: number): void
  /** The reason a refused move gives, shown once at the drop. */
  rejectionMessage(layout: TLayout, itemId: string, to: ColumnRef): string
  /** Shown when a section is dropped on another root. */
  readonly crossRootSectionMessage: string
  notify(message: string): void
}

type DropTarget = ColumnRef & { readonly index: number }

/**
 * Drag and drop for a nested layout editor. An item is never moved while it is dragged: the draft stays as it
 * was, the pointer decides a drop target (a column and the position inside it), the layout draws a marker there,
 * and the move is made once, at the drop. Dragging therefore redraws only the marker, however many items there
 * are. A move the rules refuse leaves the item where it was and says why, once, at the drop. `Esc` has nothing
 * to restore. Sections, columns and roots reorder at the drop as well.
 */
export function useLayoutDnd<TLayout, TPreview>(adapter: LayoutDndAdapter<TLayout, TPreview>) {
  const { draft, itemKind, rootKind } = adapter
  const [active, setActive] = React.useState<{ id: string; kind: string } | null>(null)
  const [preview, setPreview] = React.useState<TPreview | null>(null)
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null)
  // The latest target, read at the drop: the state above lags a render behind the last pointer move.
  const dropTargetRef = React.useRef<DropTarget | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const draggingItem = active?.kind === itemKind
  const dragState = useBuilderDragState(
    draggingItem,
    dropTarget ? `${dropTarget.rootId}:${dropTarget.sectionId}:${dropTarget.columnId}` : null,
    dropTarget?.index ?? null,
  )

  const updateDropTarget = React.useCallback((next: DropTarget | null) => {
    const current = dropTargetRef.current
    const same = next === current || (next && current && sameColumn(next, current) && next.index === current.index)
    if (same) return
    dropTargetRef.current = next
    setDropTarget(next)
  }, [])

  const onDragStart = React.useCallback(
    ({ active: dragged }: DragStartEvent) => {
      const id = String(dragged.id)
      updateDropTarget(null)
      setActive({ id, kind: kindOf(id) })
      setPreview(adapter.buildPreview(draft, id, dragged.rect.current.initial?.width ?? 0))
    },
    [draft, adapter, updateDropTarget],
  )

  const onDragMove = React.useCallback(
    ({ active: dragged, over }: DragMoveEvent) => {
      if (kindOf(String(dragged.id)) !== itemKind) return
      const overData = over?.data.current
      if (!over || !overData) {
        updateDropTarget(null)
        return
      }

      if (overData.type === 'zone') {
        const zone = overData as ColumnRef
        updateDropTarget({ rootId: zone.rootId, sectionId: zone.sectionId, columnId: zone.columnId, index: adapter.columnItemCount(draft, zone) })
      } else if (overData.type === itemKind) {
        const overLocation = adapter.locateItem(draft, String(over.id).split(':')[1])
        if (!overLocation) {
          updateDropTarget(null)
          return
        }
        // The lower half of an item lands after it, the upper half before it.
        const translated = dragged.rect.current.translated
        const below = translated ? translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2 : false
        updateDropTarget({
          rootId: overLocation.rootId,
          sectionId: overLocation.sectionId,
          columnId: overLocation.columnId,
          index: overLocation.index + (below ? 1 : 0),
        })
      }
    },
    [draft, adapter, itemKind, updateDropTarget],
  )

  const finishItem = React.useCallback(
    ({ active: dragged, over }: DragEndEvent) => {
      const target = dropTargetRef.current
      const itemId = String(dragged.id).split(':')[1]
      const from = adapter.locateItem(draft, itemId)
      if (!over || !target || !from) return

      if (sameColumn(from, target)) {
        // The target counts the dragged item itself, so a position after it is one place further than it ends up.
        const toIndex = target.index > from.index ? target.index - 1 : target.index
        if (toIndex !== from.index) adapter.reorderItems(from, from.index, toIndex)
        return
      }
      if (!adapter.moveItem({ from: { ...from, itemId }, to: target })) {
        adapter.notify(adapter.rejectionMessage(draft, itemId, target))
      }
    },
    [draft, adapter],
  )

  const finishSection = React.useCallback(
    ({ active: dragged, over }: DragEndEvent) => {
      if (!over) return
      const [, aRootId, aSectionId] = String(dragged.id).split(':')
      const [, oRootId, oSectionId] = String(over.id).split(':')
      if (aRootId !== oRootId) {
        adapter.notify(adapter.crossRootSectionMessage)
        return
      }
      const ids = adapter.sectionIds(draft, aRootId)
      if (!ids) return
      const fromIndex = ids.indexOf(aSectionId)
      const toIndex = ids.indexOf(oSectionId)
      if (fromIndex !== -1 && toIndex !== -1) adapter.reorderSections(aRootId, fromIndex, toIndex)
    },
    [draft, adapter],
  )

  const finishColumn = React.useCallback(
    ({ active: dragged, over }: DragEndEvent) => {
      if (!over) return
      const [, aRootId, aSectionId, aColumnId] = String(dragged.id).split(':')
      const [, oRootId, oSectionId, oColumnId] = String(over.id).split(':')
      if (aRootId !== oRootId || aSectionId !== oSectionId) return
      const ids = adapter.columnIds(draft, aRootId, aSectionId)
      if (!ids) return
      const fromIndex = ids.indexOf(aColumnId)
      const toIndex = ids.indexOf(oColumnId)
      if (fromIndex !== -1 && toIndex !== -1) adapter.reorderColumns(aRootId, aSectionId, fromIndex, toIndex)
    },
    [draft, adapter],
  )

  const finishRoot = React.useCallback(
    ({ active: dragged, over }: DragEndEvent) => {
      if (!over) return
      const ids = adapter.rootIds(draft)
      const fromIndex = ids.indexOf(String(dragged.id).split(':')[1])
      const toIndex = ids.indexOf(String(over.id).split(':')[1])
      // The open root is left alone: reordering must not also switch which one is open.
      if (fromIndex !== -1 && toIndex !== -1) adapter.reorderRoots(fromIndex, toIndex)
    },
    [draft, adapter],
  )

  const onDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const kind = kindOf(String(event.active.id))
      if (kind === itemKind) finishItem(event)
      else if (kind === 'section') finishSection(event)
      else if (kind === 'column') finishColumn(event)
      else if (kind === rootKind) finishRoot(event)
      updateDropTarget(null)
      setActive(null)
      setPreview(null)
    },
    [itemKind, rootKind, finishItem, finishSection, finishColumn, finishRoot, updateDropTarget],
  )

  const onDragCancel = React.useCallback(() => {
    updateDropTarget(null)
    setActive(null)
    setPreview(null)
  }, [updateDropTarget])

  return { sensors, preview, dragState, onDragStart, onDragMove, onDragEnd, onDragCancel }
}
