import { arrayMove } from '@dnd-kit/sortable'
import type { KanbanCardDisplayModel } from '../types'
import { positionBetween } from './fractional'

/** Extracts the column value out of a droppable id of the shape "col:<value>". */
export function colValueFromDroppableId(id: string): string | null {
  if (id.startsWith('col:')) {
    const val = id.slice(4)
    return val === '__null__' ? null : val
  }
  return null
}

export interface ResequencedCards {
  cards: KanbanCardDisplayModel[]
  /** entryId -> newly assigned position, for cards that had a null/colliding position. */
  updatedPositions: Map<string, string>
}

/**
 * Dedupes position collisions (demoting the later duplicate to null), sorts by
 * position ascending with null values sunk to the end, then assigns unique
 * synthetic positions to any remaining null entries.
 */
export function resequenceCards(cards: KanbanCardDisplayModel[]): ResequencedCards {
  const seen = new Set<string>()
  for (const card of cards) {
    if (card.position !== null) {
      if (seen.has(card.position)) {
        card.position = null
      } else {
        seen.add(card.position)
      }
    }
  }

  const sorted = cards.sort((a, b) => {
    if (a.position === null && b.position === null) return 0
    if (a.position === null) return 1
    if (b.position === null) return -1
    return a.position < b.position ? -1 : a.position > b.position ? 1 : 0
  })

  let lastPos: string | null = null
  const updatedPositions = new Map<string, string>()

  for (const card of sorted) {
    if (card.position === null) {
      card.position = positionBetween(lastPos, null)
      updatedPositions.set(card.entryId, card.position)
    }
    lastPos = card.position
  }

  return { cards: sorted, updatedPositions }
}

/**
 * Computes the (before, after) position bounds for inserting `entryId` at the
 * spot currently occupied by `overId` within `cards`. Shared by onDragMove
 * (same-column preview) and onDragEnd (final commit) — previously duplicated
 * inline in both.
 */
export function computeReorderBounds(
  cards: KanbanCardDisplayModel[],
  entryId: string,
  overId: string,
): { before: string | null; after: string | null } {
  const allIds = cards.map(c => c.entryId)
  const fromIdx = allIds.indexOf(entryId)
  const toIdx = allIds.indexOf(overId)

  let before: string | null
  let after: string | null

  if (fromIdx >= 0 && toIdx >= 0) {
    const reordered = arrayMove(cards, fromIdx, toIdx)
    const newIdx = reordered.findIndex(c => c.entryId === entryId)
    before = reordered[newIdx - 1]?.position ?? null
    after = reordered[newIdx + 1]?.position ?? null
  } else {
    before = cards[cards.length - 1]?.position ?? null
    after = null
  }

  // Guard: if cache still has a collision after deduplication, clamp `after`
  // to null rather than letting positionBetween crash with "a0 >= a0".
  if (before !== null && after !== null && before >= after) after = null

  return { before, after }
}
