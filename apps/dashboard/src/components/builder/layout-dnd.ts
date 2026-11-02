// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { closestCenter, pointerWithin, type Collision, type CollisionDetection, type DroppableContainer } from '@dnd-kit/core'

/*
 * The parts of a nested drag editor (root > section > column > item) that do not depend on what the item is.
 * Shared by the entry builder (tab > section > column > field) and the dashboard builder (page > section > column
 * > widget); each tells it how its own layout is shaped through a `LayoutDndAdapter`.
 */

/** A column, addressed from the top. `rootId` is the tab (entry builder) or page (dashboard builder). */
export interface ColumnRef {
  readonly rootId: string
  readonly sectionId: string
  readonly columnId: string
}

export interface ItemLocation extends ColumnRef {
  readonly index: number
  readonly count: number
}

export const sameColumn = (a: ColumnRef, b: ColumnRef) =>
  a.rootId === b.rootId && a.sectionId === b.sectionId && a.columnId === b.columnId

/** Ids are `kind:...` with UUID parts, so a colon never appears inside a part. */
export const kindOf = (id: string) => id.split(':')[0]

/**
 * Drag ids. An item's id is its own id alone: it must survive the item changing column mid-drag, which a
 * container-qualified id would not. Where an item sits is read from the draft, and carried on the sortable's
 * `data` (`type`, `rootId`, `sectionId`, `columnId`) for the collision logic.
 */
export function makeDragIds(rootKind: string, itemKind: string) {
  return {
    root: (rootId: string) => `${rootKind}:${rootId}`,
    section: (rootId: string, sectionId: string) => `section:${rootId}:${sectionId}`,
    column: (rootId: string, sectionId: string, columnId: string) => `column:${rootId}:${sectionId}:${columnId}`,
    item: (itemId: string) => `${itemKind}:${itemId}`,
    zone: (rootId: string, sectionId: string, columnId: string) => `zone:${rootId}:${sectionId}:${columnId}`,
  }
}

/** Which droppables each kind of drag may land on, by the `type` the droppable carries in its `data`. */
export function makeAccepts(rootKind: string, itemKind: string): Record<string, readonly string[]> {
  return { [itemKind]: [itemKind, 'zone'], section: ['section'], column: ['column'], [rootKind]: [rootKind] }
}

/**
 * The droppable under the pointer, restricted to what the drag can land on, so an item never "collides" with
 * a section or a root. An item under the pointer wins over the column zone that surrounds it; without a
 * pointer (keyboard) or a hit, the nearest accepted droppable decides.
 *
 * The filtering is cached per kind on the list dnd-kit hands over. That list is rebuilt only when droppables
 * mount, unmount or toggle (not on pointer moves), so keying a WeakMap by it means the filtering runs once per
 * kind instead of on every move, and a stale entry cannot outlive its list.
 */
export function createCollisionDetection(accepts: Record<string, readonly string[]>, itemKind: string): CollisionDetection {
  const acceptedByList = new WeakMap<object, Map<string, DroppableContainer[]>>()

  function acceptedContainers(all: DroppableContainer[], kind: string) {
    let byKind = acceptedByList.get(all)
    if (!byKind) {
      byKind = new Map()
      acceptedByList.set(all, byKind)
    }
    let accepted = byKind.get(kind)
    if (!accepted) {
      const types = accepts[kind] ?? []
      accepted = all.filter((container) => types.includes(String(container.data.current?.type)))
      byKind.set(kind, accepted)
    }
    return accepted
  }

  return (args) => {
    const droppableContainers = acceptedContainers(args.droppableContainers, kindOf(String(args.active.id)))
    const scoped = { ...args, droppableContainers }

    const hits = pointerWithin(scoped)
    if (hits.length > 0) {
      const typeOf = (hit: Collision) => droppableContainers.find((container) => container.id === hit.id)?.data.current
      const best = hits.find((hit) => typeOf(hit)?.type === itemKind) ?? hits[0]

      // Over a column's body but not over any of its items (in the gap between two, or below the last): the
      // nearest item of that column decides where the drop lands, instead of always "at the end".
      const zone = typeOf(best)
      if (zone?.type === 'zone') {
        const siblings = droppableContainers.filter((container) => {
          const data = container.data.current
          return data?.type === itemKind && data.rootId === zone.rootId && data.sectionId === zone.sectionId && data.columnId === zone.columnId
        })
        if (siblings.length > 0) return closestCenter({ ...scoped, droppableContainers: siblings }).slice(0, 1)
      }
      return [best]
    }
    return closestCenter(scoped)
  }
}

export interface BuilderDragState {
  /** True while an item is in flight: columns show where it can go. */
  readonly draggingItem: boolean
  /** The column the item would land in if dropped now (root:section:column), if any. */
  readonly activeColumnKey: string | null
  /** Where in that column it would land: the item goes before the one at this index (the count means last). */
  readonly dropIndex: number | null
}

export const BuilderDragContext = React.createContext<BuilderDragState>({
  draggingItem: false,
  activeColumnKey: null,
  dropIndex: null,
})

/**
 * The context value, memoised on the primitives it carries, so consumers are redrawn only when the drop target
 * really changes, not on every pointer move.
 */
export function useBuilderDragState(
  draggingItem: boolean,
  activeColumnKey: string | null,
  dropIndex: number | null,
): BuilderDragState {
  return React.useMemo(() => ({ draggingItem, activeColumnKey, dropIndex }), [draggingItem, activeColumnKey, dropIndex])
}
