// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * The shared layout drag: an item is never moved while it is dragged, only at the drop.
 * The adapter is a stub, so this covers the hook's own rules; what a move does to the dashboard layout lives in
 * use-dashboard-builder.test.ts.
 */

import { act, renderHook } from '@testing-library/react'
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ColumnRef, ItemLocation } from './layout-dnd'
import { useLayoutDnd, type LayoutDndAdapter } from './use-layout-dnd'

interface StubLayout { readonly version: number }
interface StubPreview { readonly kind: string }

const COLUMN_A: ColumnRef = { rootId: 'r1', sectionId: 's1', columnId: 'a' }
const COLUMN_B: ColumnRef = { rootId: 'r1', sectionId: 's2', columnId: 'b' }

// w1 is the dragged item, in the middle of column A with w4 before it and w5 after it; w2 and w3 are in column B.
const LOCATIONS: Record<string, ItemLocation> = {
  w4: { ...COLUMN_A, index: 0, count: 3 },
  w1: { ...COLUMN_A, index: 1, count: 3 },
  w5: { ...COLUMN_A, index: 2, count: 3 },
  w2: { ...COLUMN_B, index: 0, count: 2 },
  w3: { ...COLUMN_B, index: 1, count: 2 },
}

const startEvent = { active: { id: 'widget:w1', rect: { current: { initial: { width: 100 } } } } } as unknown as DragStartEvent

// `lower` puts the dragged item's centre below the hovered item's centre (the item's rect is 0 to 10).
const moveOver = (id: string, lower = false) =>
  ({
    active: { id: 'widget:w1', rect: { current: { translated: { top: lower ? 20 : -20, height: 4 } } } },
    over: { id: `widget:${id}`, data: { current: { type: 'widget' } }, rect: { top: 0, height: 10 } },
  }) as unknown as DragMoveEvent

const moveOverZone = (column: ColumnRef) =>
  ({
    active: { id: 'widget:w1', rect: { current: { translated: null } } },
    over: { id: 'zone:x', data: { current: { type: 'zone', ...column } }, rect: { top: 0, height: 10 } },
  }) as unknown as DragMoveEvent

const moveOverNothing = () =>
  ({ active: { id: 'widget:w1', rect: { current: { translated: null } } }, over: null }) as unknown as DragMoveEvent

const dropOn = (id: string) =>
  ({ active: { id: 'widget:w1' }, over: { id: `widget:${id}`, data: { current: { type: 'widget' } } } }) as unknown as DragEndEvent

const dropOnNothing = () => ({ active: { id: 'widget:w1' }, over: null }) as unknown as DragEndEvent

describe('useLayoutDnd', () => {
  let adapter: LayoutDndAdapter<StubLayout, StubPreview>
  let moveItem: Mock<LayoutDndAdapter<StubLayout, StubPreview>['moveItem']>
  let reorderItems: Mock<LayoutDndAdapter<StubLayout, StubPreview>['reorderItems']>
  let notify: Mock<LayoutDndAdapter<StubLayout, StubPreview>['notify']>

  beforeEach(() => {
    moveItem = vi.fn(() => true)
    reorderItems = vi.fn()
    notify = vi.fn()
    adapter = {
      rootKind: 'page',
      itemKind: 'widget',
      draft: { version: 1 },
      locateItem: (_layout, itemId) => LOCATIONS[itemId] ?? null,
      columnItemCount: (_layout, column) => (column.columnId === 'a' ? 3 : 2),
      sectionIds: () => [],
      columnIds: () => [],
      rootIds: () => [],
      buildPreview: () => ({ kind: 'widget' }),
      moveItem,
      reorderItems,
      reorderSections: vi.fn(),
      reorderColumns: vi.fn(),
      reorderRoots: vi.fn(),
      rejectionMessage: () => 'column full',
      crossRootSectionMessage: 'no cross root',
      notify,
    }
  })

  it('moves nothing while the item is dragged across other columns', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => {
      result.current.onDragMove(moveOver('w2'))
      result.current.onDragMove(moveOver('w3', true))
    })

    expect(moveItem).not.toHaveBeenCalled()
    expect(reorderItems).not.toHaveBeenCalled()
  })

  it('makes one move at the drop, to the last target the pointer reached', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => {
      result.current.onDragMove(moveOver('w2'))
      result.current.onDragMove(moveOver('w3', true))
      result.current.onDragEnd(dropOn('w3'))
    })

    expect(moveItem).toHaveBeenCalledTimes(1)
    expect(moveItem).toHaveBeenCalledWith({
      from: { ...LOCATIONS.w1, itemId: 'w1' },
      to: expect.objectContaining({ ...COLUMN_B, index: 2 }),
    })
  })

  it('lands before the hovered item on its upper half and after it on its lower half', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => result.current.onDragMove(moveOver('w2', false)))
    const upper = result.current.dragState.dropIndex
    act(() => result.current.onDragMove(moveOver('w2', true)))
    const lower = result.current.dragState.dropIndex

    expect([upper, lower]).toEqual([0, 1])
  })

  it('targets the end of the column when the pointer is over its zone', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => result.current.onDragMove(moveOverZone(COLUMN_B)))

    expect(result.current.dragState).toEqual({ draggingItem: true, activeColumnKey: 'r1:s2:b', dropIndex: 2 })
  })

  it('reorders inside the same column, counting a position after the dragged item as one place less', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => {
      result.current.onDragMove(moveOver('w5', true))
      result.current.onDragEnd(dropOn('w5'))
    })

    // The target is index 3 (after w5) counting w1 itself; with w1 taken out it ends at index 2.
    expect(reorderItems).toHaveBeenCalledWith(expect.objectContaining(COLUMN_A), 1, 2)
    expect(moveItem).not.toHaveBeenCalled()
  })

  it('does nothing when the drop would leave the item where it is', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => {
      result.current.onDragMove(moveOver('w5', false))
      result.current.onDragEnd(dropOn('w5'))
    })

    // Before w5 is the place w1 already holds.
    expect(reorderItems).not.toHaveBeenCalled()
    expect(moveItem).not.toHaveBeenCalled()
  })

  it('makes no move when the item is dropped outside any column', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => {
      result.current.onDragMove(moveOver('w2'))
      result.current.onDragMove(moveOverNothing())
      result.current.onDragEnd(dropOnNothing())
    })

    expect(moveItem).not.toHaveBeenCalled()
    expect(result.current.dragState.activeColumnKey).toBeNull()
  })

  it('makes no move when the drag is cancelled', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => {
      result.current.onDragMove(moveOver('w2'))
      result.current.onDragCancel()
    })

    expect(moveItem).not.toHaveBeenCalled()
    expect(result.current.dragState.draggingItem).toBe(false)
  })

  it('reports a refused move once, at the drop, with the adapter\'s reason', () => {
    moveItem.mockReturnValue(false)
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))

    act(() => {
      result.current.onDragMove(moveOver('w2'))
      result.current.onDragMove(moveOver('w3'))
    })
    expect(notify).not.toHaveBeenCalled()

    act(() => result.current.onDragEnd(dropOn('w3')))

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith('column full')
  })

  it('clears the drop target once the drag is over', () => {
    const { result } = renderHook(() => useLayoutDnd(adapter))
    act(() => result.current.onDragStart(startEvent))
    act(() => result.current.onDragMove(moveOver('w2')))

    act(() => result.current.onDragEnd(dropOn('w2')))

    expect(result.current.dragState).toEqual({ draggingItem: false, activeColumnKey: null, dropIndex: null })
  })
})
