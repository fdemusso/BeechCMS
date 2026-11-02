// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Active, ClientRect, Collision, CollisionDetection, DroppableContainer } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'
import { createCollisionDetection, makeAccepts } from './layout-dnd'

type Args = Parameters<CollisionDetection>[0]

const rect = (top: number, left = 0, width = 100, height = 40): ClientRect => ({
  top,
  left,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

interface Item { id: string; data: Record<string, unknown>; rect: ClientRect }

const COLUMN = { rootId: 'r1', sectionId: 's1', columnId: 'a' }

// A column whose body spans 0 to 200, holding two widgets with a gap between them (0 to 40 and 60 to 100).
const ZONE: Item = { id: 'zone:a', data: { type: 'zone', ...COLUMN }, rect: rect(0, 0, 100, 200) }
const FIRST: Item = { id: 'widget:w1', data: { type: 'widget', ...COLUMN }, rect: rect(0) }
const SECOND: Item = { id: 'widget:w2', data: { type: 'widget', ...COLUMN }, rect: rect(60) }
const OTHER_COLUMN_WIDGET: Item = {
  id: 'widget:w3',
  data: { type: 'widget', rootId: 'r1', sectionId: 's1', columnId: 'b' },
  rect: rect(110, 200),
}

function collide(items: Item[], pointer: { x: number; y: number }): string[] {
  const containers = items.map((item) => ({ id: item.id, data: { current: item.data } })) as unknown as DroppableContainer[]
  const droppableRects = new Map(items.map((item) => [item.id, item.rect]))
  const args = {
    active: { id: 'widget:dragged' } as Active,
    collisionRect: rect(pointer.y - 5, pointer.x - 5, 10, 10),
    droppableRects,
    droppableContainers: containers,
    pointerCoordinates: pointer,
  } as Args

  const detect = createCollisionDetection(makeAccepts('page', 'widget'), 'widget')
  return detect(args).map((collision: Collision) => String(collision.id))
}

describe('createCollisionDetection', () => {
  it('picks the item under the pointer over the zone that surrounds it', () => {
    const hit = collide([ZONE, FIRST, SECOND], { x: 50, y: 20 })

    expect(hit).toEqual(['widget:w1'])
  })

  it('picks the nearest item of the column when the pointer is in the gap between two', () => {
    const hit = collide([ZONE, FIRST, SECOND], { x: 50, y: 55 })

    expect(hit).toEqual(['widget:w2'])
  })

  it('picks the last item of the column when the pointer is below it', () => {
    const hit = collide([ZONE, FIRST, SECOND], { x: 50, y: 150 })

    expect(hit).toEqual(['widget:w2'])
  })

  it('never picks an item of another column for a pointer over this column\'s body', () => {
    const hit = collide([ZONE, FIRST, SECOND, OTHER_COLUMN_WIDGET], { x: 50, y: 150 })

    expect(hit).toEqual(['widget:w2'])
  })

  it('picks the zone itself when the column holds no item', () => {
    const hit = collide([ZONE], { x: 50, y: 100 })

    expect(hit).toEqual(['zone:a'])
  })

  it('ignores droppables a widget cannot land on', () => {
    const section: Item = { id: 'section:r1:s1', data: { type: 'section' }, rect: rect(0, 0, 100, 300) }

    const hit = collide([section, ZONE], { x: 50, y: 100 })

    expect(hit).toEqual(['zone:a'])
  })
})
