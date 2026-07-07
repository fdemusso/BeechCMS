import { useReducer, useCallback } from 'react'

export interface DragSnapshot {
  entryId: string
  sourceColValue: string | null
  sourcePosition: string | null
  sourceAxisValue: string | null
}

interface PendingEntry {
  destColValue: string | null
  position: string
  axisValue: string | null
}

interface KanbanBoardState {
  pending: Map<string, PendingEntry>
  snapshots: Map<string, DragSnapshot>
}

export type KanbanBoardAction =
  | { type: 'DRAG_START'; snapshot: DragSnapshot }
  | { type: 'DRAG_OPTIMISTIC'; entryId: string; destColValue: string | null; position: string; axisValue: string | null }
  | { type: 'DRAG_COMMIT'; entryId: string }
  | { type: 'DRAG_ROLLBACK'; entryId: string }
  | { type: 'DRAG_REMOVE'; entryId: string }
  | { type: 'DRAG_CLEAR'; entryId: string }

const initialState: KanbanBoardState = {
  pending: new Map(),
  snapshots: new Map(),
}

function reducer(state: KanbanBoardState, action: KanbanBoardAction): KanbanBoardState {
  switch (action.type) {
    case 'DRAG_START': {
      const snapshots = new Map(state.snapshots)
      snapshots.set(action.snapshot.entryId, action.snapshot)
      return { ...state, snapshots }
    }
    case 'DRAG_OPTIMISTIC': {
      const pending = new Map(state.pending)
      pending.set(action.entryId, {
        destColValue: action.destColValue,
        position: action.position,
        axisValue: action.axisValue,
      })
      return { ...state, pending }
    }
    case 'DRAG_COMMIT':
    case 'DRAG_CLEAR': {
      const pending = new Map(state.pending)
      const snapshots = new Map(state.snapshots)
      pending.delete(action.entryId)
      snapshots.delete(action.entryId)
      return { ...state, pending, snapshots }
    }
    case 'DRAG_ROLLBACK': {
      const pending = new Map(state.pending)
      const snapshots = new Map(state.snapshots)
      pending.delete(action.entryId)
      snapshots.delete(action.entryId)
      return { ...state, pending, snapshots }
    }
    case 'DRAG_REMOVE': {
      const pending = new Map(state.pending)
      const snapshots = new Map(state.snapshots)
      pending.delete(action.entryId)
      snapshots.delete(action.entryId)
      return { ...state, pending, snapshots }
    }
    default:
      return state
  }
}

export function useKanbanBoard() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const isPending = useCallback(
    (entryId: string) => state.pending.has(entryId),
    [state.pending],
  )

  const getPendingEntry = useCallback(
    (entryId: string) => state.pending.get(entryId),
    [state.pending],
  )

  const getSnapshot = useCallback(
    (entryId: string) => state.snapshots.get(entryId),
    [state.snapshots],
  )

  return { state, dispatch, isPending, getPendingEntry, getSnapshot }
}
