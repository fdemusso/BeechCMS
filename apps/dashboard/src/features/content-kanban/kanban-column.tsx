import * as React from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KANBAN_CARD_HEIGHT_PX, KANBAN_COLUMN_WIDTH_PX } from './constants'
import type { KanbanCardDisplayModel, KanbanColumnFetchState } from './types'
import { KanbanColumnVirtualizer } from './kanban-column-virtualizer'

interface KanbanColumnProps {
  colValue: string | null
  label: string
  fetchState: KanbanColumnFetchState
  cards: KanbanCardDisplayModel[]
  collapsed: boolean
  canEdit: boolean
  sortActive: boolean
  onToggleCollapse: () => void
  onEdit: (id: string) => void
  onCreateEntry?: () => void
}

function SkeletonCard() {
  return (
    <div
      className="rounded-md border bg-muted/40 animate-pulse"
      style={{ height: KANBAN_CARD_HEIGHT_PX, margin: '0 4px 4px' }}
    />
  )
}

export const KanbanColumn = React.memo(function KanbanColumn({
  colValue,
  label,
  fetchState,
  cards,
  collapsed,
  canEdit,
  sortActive,
  onToggleCollapse,
  onEdit,
  onCreateEntry,
}: KanbanColumnProps) {
  const droppableId = `col:${colValue ?? '__null__'}`
  const { isOver, setNodeRef } = useDroppable({ id: droppableId, data: { colValue } })

  const { total, hasNextPage, isLoading, isFetching, fetchNextPage } = fetchState
  const loaded = cards.length
  const hasUnloaded = total > loaded
  const cardIds = cards.map(c => c.entryId)

  const ariaLiveRef = React.useRef<HTMLDivElement>(null)

  return (
    <section
      role="region"
      aria-label={`${label} — ${total} voci`}
      className="flex flex-col rounded-lg border bg-muted/20"
      style={{ width: KANBAN_COLUMN_WIDTH_PX, minWidth: KANBAN_COLUMN_WIDTH_PX, flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground/80"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span className="truncate max-w-[140px]">{label}</span>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {loaded}/{total}
            {hasUnloaded && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" aria-hidden="true" />}
          </span>
          {onCreateEntry && (
            <button type="button" onClick={onCreateEntry} className="rounded p-0.5 hover:bg-muted" aria-label={`Nuova voce in ${label}`}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* aria-live for keyboard drag announcements (KB-S29) */}
      <div ref={ariaLiveRef} aria-live="polite" className="sr-only" />

      {/* Drop zone — always mounted so collapsed columns accept drops (KB-U06b) */}
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex-1 transition-colors ${isOver ? 'bg-primary/5 ring-1 ring-primary/30 ring-inset rounded-b-lg' : ''}`}
        >
          {!collapsed && (
            <div className="flex flex-1 flex-col overflow-hidden" style={{ height: 'calc(100vh - 14rem)', minHeight: 0 }}>
              {isLoading ? (
                <div className="flex flex-col gap-0 pt-1 flex-grow h-full">
                  {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : cards.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 flex-grow h-full">
                  <p className="text-xs text-muted-foreground">Nessuna voce</p>
                  {onCreateEntry && (
                    <button type="button" onClick={onCreateEntry} className="text-xs text-primary hover:underline">
                      + Nuova entry
                    </button>
                  )}
                </div>
              ) : (
                <KanbanColumnVirtualizer
                  cards={cards}
                  colValue={colValue}
                  canEdit={canEdit}
                  sortActive={sortActive}
                  onEdit={onEdit}
                />
              )}

              {!isLoading && hasNextPage && (
                <button
                  type="button"
                  disabled={isFetching}
                  onClick={() => fetchNextPage()}
                  className="shrink-0 border-t py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {isFetching ? 'Caricamento…' : `Carica altri (${total - loaded})`}
                </button>
              )}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  )
})
