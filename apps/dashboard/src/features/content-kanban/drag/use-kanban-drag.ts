import { useRef, useCallback } from 'react'
import {
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragCancelEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Branch, KanbanMoveBody } from '@beechcms/core'
import { moveKanbanCard } from '@/lib/content-api'
import type { ContentListWithMeta } from '@/lib/content-api'
import { positionBetween } from './fractional'
import type { KanbanBoardAction, DragSnapshot } from './use-kanban-board'
import { KANBAN_SETTLE_MS, KANBAN_POSITION_REBALANCE_THRESHOLD } from '../constants'
import type { KanbanCardDisplayModel } from '../types'
import { buildKanbanCardDisplayModel } from '../kanban-card-display'
// TODO: remove debug log helper
function writeDebugLog(message: string, data: any) {
  fetch('/auth/kanban-debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, data })
  }).catch(() => {})
}

interface UseKanbanDragOptions {
  seedSlug: string
  axisBranchId: string
  axisBranch: Branch
  canEdit: boolean
  activeSort: boolean
  dispatch: (action: KanbanBoardAction) => void
}

function getCardsFromCache(
  queryClient: QueryClient,
  seedSlug: string,
  axisBranchId: string,
  axisBranch: Branch,
  colValue: string | null,
): KanbanCardDisplayModel[] {
  const cached = queryClient.getQueriesData<InfiniteData<ContentListWithMeta>>({
    queryKey: ['kanban', seedSlug, axisBranchId, colValue],
  })
  const cards: KanbanCardDisplayModel[] = []
  for (const [, data] of cached) {
    if (!data) continue
    for (const page of data.pages) {
      for (const item of page.items) {
        cards.push(buildKanbanCardDisplayModel(item, axisBranch, colValue))
      }
    }
  }

  // 1. Detect duplicates BEFORE sorting so demoted cards (null) sink to the end
  // of the array during the sort below — not left in the middle where
  // positionBetween could generate a key that collides with an existing one.
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

  // 2. Sort: real positions ascending, null values sink to the end.
  const sorted = cards.sort((a, b) => {
    if (a.position === null && b.position === null) return 0
    if (a.position === null) return 1
    if (b.position === null) return -1
    return a.position < b.position ? -1 : a.position > b.position ? 1 : 0
  })

  // 3. Assign unique synthetic positions to nulls (all at the end now) and
  // write them back to the React Query cache for stable ordering on future drags.
  let lastPos: string | null = null
  let cacheUpdated = false
  const updatedItemsMap = new Map<string, string>()

  for (const card of sorted) {
    if (card.position === null) {
      card.position = positionBetween(lastPos, null)
      updatedItemsMap.set(card.entryId, card.position)
      cacheUpdated = true
    }
    lastPos = card.position
  }

  if (cacheUpdated) {
    queryClient.setQueriesData<InfiniteData<ContentListWithMeta>>(
      { queryKey: ['kanban', seedSlug, axisBranchId, colValue] },
      (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((item: any) => {
              if (updatedItemsMap.has(item.id)) {
                return { ...item, position: updatedItemsMap.get(item.id) }
              }
              return item
            }),
          })),
        }
      },
    )
  }

  return sorted
}

function colValueFromDroppableId(id: string): string | null {
  if (id.startsWith('col:')) {
    const val = id.slice(4)
    return val === '__null__' ? null : val
  }
  return null
}

export function useKanbanDrag(opts: UseKanbanDragOptions) {
  const queryClient = useQueryClient()

  // Stable refs — never trigger re-renders, safe to read inside async callbacks
  const optsRef = useRef(opts)
  optsRef.current = opts

  const activeIdRef = useRef<string | null>(null)
  const snapshotRef = useRef<DragSnapshot | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const committedColValueRef = useRef<string | null | undefined>(undefined)
  const committedOverIdRef = useRef<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function clearTimerAndRefs() {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
    committedOverIdRef.current = null
    committedColValueRef.current = undefined
  }

  const onDragStart = useCallback((event: DragStartEvent) => {
    const { canEdit, dispatch, seedSlug, axisBranchId, axisBranch } = optsRef.current
    if (!canEdit) return
    const entryId = String(event.active.id)
    activeIdRef.current = entryId

    const activeData = event.active.data.current as Record<string, unknown> | undefined
    const srcColValue: string | null = (activeData?.colValue as string | null | undefined) ?? null

    const cards = getCardsFromCache(queryClient, seedSlug, axisBranchId, axisBranch, srcColValue)
    const card = cards.find(c => c.entryId === entryId)

    // TODO: remove debug log
    writeDebugLog('[KANBAN DEBUG] --- DRAG START ---', {
      entryId,
      srcColValue,
      cardPosition: card?.position,
      totalCardsInSourceCol: cards.length,
      cards: cards.map(c => ({ id: c.entryId, pos: c.position }))
    })

    const snapshot: DragSnapshot = {
      entryId,
      sourceColValue: srcColValue,
      sourcePosition: card?.position ?? null,
      sourceAxisValue: card?.axisValue ?? null,
    }
    snapshotRef.current = snapshot
    dispatch({ type: 'DRAG_START', snapshot })
  }, [queryClient])

  const onDragMove = useCallback((event: DragMoveEvent) => {
    const over = event.over
    if (!over) return

    const overColValue = over.data.current?.colValue !== undefined
      ? (over.data.current.colValue as string | null)
      : colValueFromDroppableId(String(over.id))

    if (committedColValueRef.current === overColValue && committedOverIdRef.current === String(over.id)) return

    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)

    settleTimerRef.current = setTimeout(() => {
      committedOverIdRef.current = String(over.id)
      committedColValueRef.current = overColValue

      const entryId = activeIdRef.current
      const snapshot = snapshotRef.current
      if (!entryId || !snapshot) return

      const { seedSlug, axisBranchId, axisBranch, activeSort, dispatch } = optsRef.current
      const isSameColumn = overColValue === snapshot.sourceColValue

      // KB-U22b: same-column reorder disabled while sort is active — bail before
      // sending DRAG_OPTIMISTIC so the card never enters pending state.
      if (isSameColumn && activeSort) return

      const srcCards = getCardsFromCache(queryClient, seedSlug, axisBranchId, axisBranch, snapshot.sourceColValue)
      const destCards = isSameColumn ? srcCards : getCardsFromCache(queryClient, seedSlug, axisBranchId, axisBranch, overColValue)

      let before: string | null = null
      let after: string | null = null

      if (isSameColumn) {
        const allIds = srcCards.map(c => c.entryId)
        const fromIdx = allIds.indexOf(entryId)
        const toIdx = allIds.indexOf(String(over.id))
        if (fromIdx >= 0 && toIdx >= 0) {
          const reordered = arrayMove(srcCards, fromIdx, toIdx)
          const newIdx = reordered.findIndex(c => c.entryId === entryId)
          before = reordered[newIdx - 1]?.position ?? null
          after = reordered[newIdx + 1]?.position ?? null
        } else {
          before = srcCards[srcCards.length - 1]?.position ?? null
          after = null
        }
      } else {
        const overCardIdx = destCards.findIndex(c => c.entryId === String(over.id))
        if (overCardIdx >= 0) {
          before = destCards[overCardIdx - 1]?.position ?? null
          after = destCards[overCardIdx]?.position ?? null
        } else {
          before = destCards[destCards.length - 1]?.position ?? null
          after = null
        }
      }

      // Guard: if cache still has a collision after deduplication, clamp after to null
      // rather than letting positionBetween crash with "a0 >= a0".
      if (before !== null && after !== null && before >= after) after = null

      const tempPosition = positionBetween(before, after)
      const card = srcCards.find(c => c.entryId === entryId)
      const newAxisValue = isSameColumn ? (card?.axisValue ?? null) : overColValue

      // TODO: remove debug log
      writeDebugLog('[KANBAN DEBUG] --- SETTLE TIMER FIRED (DRAG MOVE) ---', {
        activeCard: entryId,
        hoveredOverId: over.id,
        hoveredColValue: overColValue,
        isSameColumn,
        beforeCardPos: before,
        afterCardPos: after,
        calculatedTempPosition: tempPosition,
        destCardsCount: destCards.length,
        destCards: destCards.map(c => ({ id: c.entryId, pos: c.position }))
      })

      dispatch({
        type: 'DRAG_OPTIMISTIC',
        entryId,
        destColValue: overColValue,
        position: tempPosition,
        axisValue: newAxisValue,
      })
    }, KANBAN_SETTLE_MS)
  }, [queryClient])

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { seedSlug, axisBranchId, axisBranch, activeSort, dispatch } = optsRef.current

    const entryId = activeIdRef.current
    const snapshot = snapshotRef.current
    // Save committedOverId BEFORE clearTimerAndRefs() zeros it out.
    // Needed when the user drops on the ghost (over.id === entryId) — the ghost shares
    // the dragged card's id but isn't in destCards cache yet; committedOverId is the
    // real card the ghost appeared next to.
    const savedCommittedOverId = committedOverIdRef.current

    // TODO: remove debug log
    writeDebugLog('[KANBAN DEBUG] --- ON DRAG END ENTERED ---', {
      entryId,
      hasOver: !!event.over,
      overId: event.over ? String(event.over.id) : null,
      hasSnapshot: !!snapshot,
      savedCommittedOverId,
    })

    clearTimerAndRefs()
    activeIdRef.current = null
    snapshotRef.current = null

    // KB-U09b: silent cancel when dropped outside any column
    if (!event.over || !entryId || !snapshot) {
      if (entryId) dispatch({ type: 'DRAG_ROLLBACK', entryId })
      return
    }

    const over = event.over
    // Always read destColValue from the live drop target — the ghost already carries
    // the correct colValue in its data, so reading savedCommittedColValue would give
    // a stale value when the user moves quickly to a third column after the ghost appeared.
    const destColValue: string | null = over.data.current?.colValue !== undefined
      ? (over.data.current.colValue as string | null)
      : colValueFromDroppableId(String(over.id))

    const srcColValue = snapshot.sourceColValue
    const isSameColumn = destColValue === srcColValue

    // KB-U22b: same-column reorder disabled while sort is active.
    // Rollback instead of bare return — prevents the card from freezing in
    // pending state if the settle timer fired before the drag ended.
    if (isSameColumn && activeSort) {
      dispatch({ type: 'DRAG_ROLLBACK', entryId })
      return
    }

    const srcCards = getCardsFromCache(queryClient, seedSlug, axisBranchId, axisBranch, srcColValue)
    const destCards = isSameColumn ? srcCards : getCardsFromCache(queryClient, seedSlug, axisBranchId, axisBranch, destColValue)

    // If the user drops on the ghost (over.id === entryId), the ghost isn't in the
    // cache yet — fall back to savedCommittedOverId (the real card the ghost appeared
    // next to). This applies to both same-column and cross-column drops.
    const rawOverId = String(over.id)
    const effectiveOverId =
      rawOverId === entryId && savedCommittedOverId !== null && savedCommittedOverId !== rawOverId
        ? savedCommittedOverId
        : rawOverId

    let before: string | null = null
    let after: string | null = null

    if (isSameColumn) {
      // Use arrayMove to get the correct insertion order — fixes the asymmetric
      // down-drag bug where (before=dragged, after=over) placed the card in the
      // wrong position relative to the over card.
      const allIds = srcCards.map(c => c.entryId)
      const fromIdx = allIds.indexOf(entryId)
      const toIdx = allIds.indexOf(effectiveOverId)
      if (fromIdx >= 0 && toIdx >= 0) {
        const reordered = arrayMove(srcCards, fromIdx, toIdx)
        const newIdx = reordered.findIndex(c => c.entryId === entryId)
        before = reordered[newIdx - 1]?.position ?? null
        after = reordered[newIdx + 1]?.position ?? null
      } else {
        before = srcCards[srcCards.length - 1]?.position ?? null
        after = null
      }
    } else {
      // Cross-column: insert before the over card, or append at end if
      // the user dropped on the column background (over.id = droppable id).
      const overCardIdx = destCards.findIndex(c => c.entryId === effectiveOverId)
      if (overCardIdx >= 0) {
        before = destCards[overCardIdx - 1]?.position ?? null
        after = destCards[overCardIdx]?.position ?? null
      } else {
        before = destCards[destCards.length - 1]?.position ?? null
        after = null
      }
    }

    // Guard: if cache still has a collision after deduplication, clamp after to null
    // rather than letting positionBetween crash with "a0 >= a0".
    if (before !== null && after !== null && before >= after) after = null

    const newPosition = positionBetween(before, after)
    const card = srcCards.find(c => c.entryId === entryId)
    const newAxisValue = isSameColumn ? (card?.axisValue ?? null) : destColValue

    // TODO: remove debug log
    writeDebugLog('[KANBAN DEBUG] --- DRAG END ---', {
      activeCard: entryId,
      rawOverId,
      savedCommittedOverId,
      calculatedDestColValue: destColValue,
      isSameColumn,
      beforePosition: before,
      afterPosition: after,
      generatedNewPosition: newPosition,
      destCardsCount: destCards.length,
      destCards: destCards.map(c => ({ id: c.entryId, pos: c.position }))
    })

    dispatch({ type: 'DRAG_OPTIMISTIC', entryId, destColValue, position: newPosition, axisValue: newAxisValue })

    let body: KanbanMoveBody
    if (isSameColumn) {
      body = { axisBranchId, position: newPosition }
    } else {
      const axis = axisBranch.type === 'tags'
        ? { kind: 'tags' as const, oldValue: card?.axisValue ?? null, newValue: destColValue }
        : { kind: 'scalar' as const, value: destColValue }
      body = { axisBranchId, position: newPosition, axis }
    }

    // TODO: remove debug log
    writeDebugLog('[KANBAN DEBUG] API moveKanbanCard payload:', {
      entryId,
      body
    })

    // Find entry in cache before patching so we can insert it in dest
    let cachedEntry: unknown
    const srcCached = queryClient.getQueriesData<InfiniteData<ContentListWithMeta>>({
      queryKey: ['kanban', seedSlug, axisBranchId, srcColValue],
    })
    for (const [, data] of srcCached) {
      if (!data) continue
      for (const page of data.pages) {
        const found = page.items.find((i: any) => i.id === entryId)
        if (found) { cachedEntry = found; break }
      }
      if (cachedEntry) break
    }

    try {
      await moveKanbanCard(seedSlug, entryId, body)

      if (isSameColumn) {
        // Same-column reorder: update position in-place so the node stays in the DOM
        // while dnd-kit completes its pointer-release cycle. Removing the node here
        // would freeze all future drags until the page reloads (dnd-kit sensor crash).
        queryClient.setQueriesData<InfiniteData<ContentListWithMeta>>(
          { queryKey: ['kanban', seedSlug, axisBranchId, srcColValue] },
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((item: any) =>
                  item.id === entryId ? { ...item, position: newPosition } : item,
                ),
              })),
            }
          },
        )
      } else {
        // Cross-column move: remove from source, insert at top of destination
        queryClient.setQueriesData<InfiniteData<ContentListWithMeta>>(
          { queryKey: ['kanban', seedSlug, axisBranchId, srcColValue] },
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                total: Math.max(0, page.total - 1),
                items: page.items.filter((item: any) => item.id !== entryId),
              })),
            }
          },
        )

        const updatedEntry = {
          ...(cachedEntry as object ?? { id: entryId }),
          position: newPosition,
          [axisBranch.alias]: newAxisValue,
        }
        queryClient.setQueriesData<InfiniteData<ContentListWithMeta>>(
          { queryKey: ['kanban', seedSlug, axisBranchId, destColValue] },
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page, i) =>
                i === 0
                  ? { ...page, total: page.total + 1, items: [updatedEntry, ...page.items] }
                  : page,
              ),
            }
          },
        )
      }

      dispatch({ type: 'DRAG_COMMIT', entryId })

      if (newPosition.length > KANBAN_POSITION_REBALANCE_THRESHOLD) {
        // Rebalance is OPTIONAL (Ponytail-gated) — skipped in v1
      }
    } catch (err: unknown) {
      const status = (err as any)?.response?.status
      if (status === 404) {
        dispatch({ type: 'DRAG_REMOVE', entryId })
        toast.error('Questa entry non è più disponibile.')
      } else {
        dispatch({ type: 'DRAG_ROLLBACK', entryId })
        toast.error('Impossibile spostare la scheda. Riprovare.')
      }
    }
  }, [queryClient])

  const onDragCancel = useCallback((_event: DragCancelEvent) => {
    const entryId = activeIdRef.current
    const { dispatch } = optsRef.current
    clearTimerAndRefs()
    activeIdRef.current = null
    snapshotRef.current = null
    if (entryId) {
      dispatch({ type: 'DRAG_ROLLBACK', entryId })
    }
  }, [])

  return {
    sensors,
    collisionDetection: closestCenter,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    getActiveId: () => activeIdRef.current,
  }
}
