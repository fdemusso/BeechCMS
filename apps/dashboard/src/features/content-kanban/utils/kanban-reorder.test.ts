import { describe, it, expect } from 'vitest'
import { colValueFromDroppableId, resequenceCards, computeReorderBounds } from './kanban-reorder'
import type { KanbanCardDisplayModel } from '../types'

function makeCard(entryId: string, position: string | null): KanbanCardDisplayModel {
  return { entryId, title: entryId, axisValue: null, position }
}

describe('colValueFromDroppableId', () => {
  it('extracts the column value from a "col:<value>" id', () => {
    expect(colValueFromDroppableId('col:done')).toBe('done')
  })

  it('returns null for the "col:__null__" sentinel', () => {
    expect(colValueFromDroppableId('col:__null__')).toBeNull()
  })

  it('returns null for ids without the "col:" prefix', () => {
    expect(colValueFromDroppableId('something-else')).toBeNull()
  })
})

describe('resequenceCards', () => {
  it('assigns sequential synthetic positions to all-null cards in original order', () => {
    const cards = [makeCard('a', null), makeCard('b', null), makeCard('c', null)]
    const { cards: sorted, updatedPositions } = resequenceCards(cards)
    expect(sorted.map(c => c.entryId)).toEqual(['a', 'b', 'c'])
    expect(updatedPositions.size).toBe(3)
    const positions = sorted.map(c => c.position as string)
    expect(positions).toEqual([...positions].sort())
  })

  it('demotes a duplicate position on the second card and re-assigns it after the first', () => {
    const cards = [makeCard('a', 'a0'), makeCard('b', 'a0'), makeCard('c', 'a1')]
    const { cards: sorted, updatedPositions } = resequenceCards(cards)
    expect(sorted.find(c => c.entryId === 'a')?.position).toBe('a0')
    expect(sorted.find(c => c.entryId === 'c')?.position).toBe('a1')
    expect(updatedPositions.has('b')).toBe(true)
    expect(sorted.find(c => c.entryId === 'b')?.position).not.toBe('a0')
  })

  it('sorts mixed real ascending positions with an interspersed null sunk to the end', () => {
    const cards = [makeCard('a', 'a0'), makeCard('b', null), makeCard('c', 'a2')]
    const { cards: sorted } = resequenceCards(cards)
    expect(sorted.map(c => c.entryId)).toEqual(['a', 'c', 'b'])
  })

  it('updatedPositions contains exactly the entryIds that changed', () => {
    const cards = [makeCard('a', 'a0'), makeCard('b', 'a1'), makeCard('c', null)]
    const { updatedPositions } = resequenceCards(cards)
    expect([...updatedPositions.keys()]).toEqual(['c'])
  })
})

describe('computeReorderBounds', () => {
  it('returns the correct before/after pair when moving a card earlier in a 3+ card list', () => {
    const cards = [makeCard('a', 'a0'), makeCard('b', 'a1'), makeCard('c', 'a2')]
    const { before, after } = computeReorderBounds(cards, 'c', 'a')
    expect(before).toBeNull()
    expect(after).toBe('a0')
  })

  it('falls back to appending at the end when overId is not found in cards', () => {
    const cards = [makeCard('a', 'a0'), makeCard('b', 'a1')]
    const { before, after } = computeReorderBounds(cards, 'a', 'missing')
    expect(before).toBe('a1')
    expect(after).toBeNull()
  })

  it('clamps after to null when the naive before/after would satisfy before >= after', () => {
    const cards = [makeCard('a', 'a0'), makeCard('b', 'a0'), makeCard('c', 'a0'), makeCard('d', 'a0')]
    const { before, after } = computeReorderBounds(cards, 'a', 'c')
    expect(before).toBe('a0')
    expect(after).toBeNull()
  })

  it('returns after=null when the card is moved to the last slot', () => {
    const cards = [makeCard('a', 'a0'), makeCard('b', 'a1'), makeCard('c', 'a2')]
    const { before, after } = computeReorderBounds(cards, 'a', 'c')
    expect(before).toBe('a2')
    expect(after).toBeNull()
  })

  it('falls back to before=null, after=null on an empty cards array', () => {
    const { before, after } = computeReorderBounds([], 'a', 'missing')
    expect(before).toBeNull()
    expect(after).toBeNull()
  })

  it('returns a non-null before/after pair unclamped when already correctly ordered', () => {
    const cards = [makeCard('a', 'a0'), makeCard('b', 'a1'), makeCard('c', 'a2'), makeCard('d', 'a3')]
    const { before, after } = computeReorderBounds(cards, 'a', 'c')
    expect(before).toBe('a2')
    expect(after).toBe('a3')
  })
})
