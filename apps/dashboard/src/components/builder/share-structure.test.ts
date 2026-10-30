// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { shareStructure } from './share-structure'

interface Widget { id: string; title: string; config: { variant: string } }
interface Layout { pages: { id: string; widgets: Widget[] }[] }

const widget = (id: string, title = id): Widget => ({ id, title, config: { variant: 'a' } })

describe('shareStructure', () => {
  it('returns the previous object when nothing changed', () => {
    const previous: Layout = { pages: [{ id: 'p1', widgets: [widget('w1')] }] }
    const next: Layout = structuredClone(previous)

    const result = shareStructure(previous, next)

    expect(result).toBe(previous)
  })

  it('keeps the identity of every widget that did not change when one is renamed', () => {
    const previous: Layout = { pages: [{ id: 'p1', widgets: [widget('w1'), widget('w2')] }] }
    const next = structuredClone(previous)
    next.pages[0].widgets[1].title = 'Renamed'

    const result = shareStructure(previous, next)

    expect(result.pages[0].widgets[0]).toBe(previous.pages[0].widgets[0])
    expect(result.pages[0].widgets[1]).not.toBe(previous.pages[0].widgets[1])
    expect(result.pages[0].widgets[1].title).toBe('Renamed')
  })

  it('gives the containers of a changed widget a new identity and leaves the rest of the tree alone', () => {
    const previous: Layout = {
      pages: [
        { id: 'p1', widgets: [widget('w1')] },
        { id: 'p2', widgets: [widget('w2')] },
      ],
    }
    const next = structuredClone(previous)
    next.pages[0].widgets[0].config.variant = 'b'

    const result = shareStructure(previous, next)

    expect(result).not.toBe(previous)
    expect(result.pages[0]).not.toBe(previous.pages[0])
    expect(result.pages[1]).toBe(previous.pages[1])
  })

  it('matches array items by id, so a neighbour that only shifted position keeps its identity', () => {
    const previous: Layout = { pages: [{ id: 'p1', widgets: [widget('w1'), widget('w2'), widget('w3')] }] }
    const next = structuredClone(previous)
    next.pages[0].widgets.shift()

    const result = shareStructure(previous, next)

    // Index matching would compare w2 with w1 and hand back a new object for every remaining widget.
    expect(result.pages[0].widgets).toHaveLength(2)
    expect(result.pages[0].widgets[0]).toBe(previous.pages[0].widgets[1])
    expect(result.pages[0].widgets[1]).toBe(previous.pages[0].widgets[2])
  })

  it('returns a result equal to next even when parts were swapped for old references', () => {
    const previous: Layout = { pages: [{ id: 'p1', widgets: [widget('w1'), widget('w2')] }] }
    const next = structuredClone(previous)
    next.pages[0].widgets.reverse()

    const result = shareStructure(previous, next)

    expect(result).toEqual(next)
  })
})
