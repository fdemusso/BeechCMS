import * as React from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { resolveKanbanConfig } from '@beechcms/core'
import type { Branch, KanbanColumnDescriptor, FilterGroup } from '@beechcms/core'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useKanbanColumns } from './hooks/use-kanban-columns'
import { useKanbanColumnQuery } from './hooks/use-kanban-column-query'
import { KanbanColumn } from './kanban-column'
import { KanbanCardOverlay } from './kanban-card-overlay'
import { useKanbanBoard } from './drag/use-kanban-board'
import { useKanbanDrag } from './drag/use-kanban-drag'
import { buildKanbanCardDisplayModel } from './kanban-card-display'
import { KANBAN_COLUMN_WIDTH_PX } from './constants'
import type { ContentKanbanProps, KanbanBoardConfig, KanbanCardDisplayModel } from './types'
import type { ContentListWithMeta } from '@/lib/content-api'

// For now canEdit defaults to true; integrate with permission system when available
const DEFAULT_CAN_EDIT = true

interface ColumnProps {
  seedSlug: string
  axisBranch: Branch
  col: KanbanColumnDescriptor
  config: KanbanBoardConfig
  activeFilters: FilterGroup[]
  search: string
  collapsed: boolean
  canEdit: boolean
  sortActive: boolean
  pendingCards: Map<string, { destColValue: string | null; position: string; axisValue: string | null }>
  onToggleCollapse: () => void
  onEdit: (id: string) => void
  onCreateEntry?: () => void
}

function KanbanColumnConnected({
  seedSlug, axisBranch, col, config, activeFilters, search, collapsed,
  canEdit, sortActive, pendingCards,
  onToggleCollapse, onEdit, onCreateEntry,
}: ColumnProps) {
  const fetchState = useKanbanColumnQuery(seedSlug, axisBranch, col, config, activeFilters, search)
  const queryClient = useQueryClient()

  // Apply optimistic overlay: swap out/in cards based on pending moves
  const cards: KanbanCardDisplayModel[] = React.useMemo(() => {
    const colValue = col.value
    const base = fetchState.cards.filter(c => {
      const p = pendingCards.get(c.entryId)
      // Remove cards that were moved out of this column
      return !p || p.destColValue === colValue
    })

    // Add cards that were moved into this column
    const incoming: KanbanCardDisplayModel[] = []
    for (const [entryId, p] of pendingCards.entries()) {
      if (p.destColValue !== colValue) continue
      // Only add if not already in base (cross-column moves)
      if (!base.some(c => c.entryId === entryId)) {
        let realTitle = entryId
        const allCached = queryClient.getQueriesData<InfiniteData<ContentListWithMeta>>({
          queryKey: ['kanban', seedSlug, config.axisBranchId],
        })
        outer: for (const [, data] of allCached) {
          if (!data) continue
          for (const page of data.pages) {
            const item = page.items.find(i => i.id === entryId)
            if (item) {
              realTitle = buildKanbanCardDisplayModel(item, axisBranch, p.axisValue).title
              break outer
            }
          }
        }
        incoming.push({
          entryId,
          title: realTitle,
          axisValue: p.axisValue,
          position: p.position,
          isPending: true,
        })
      }
    }

    const merged = [...base.map(c => {
      const p = pendingCards.get(c.entryId)
      return {
        ...c,
        isPending: !!p,
        position: p ? p.position : c.position,
      }
    }), ...incoming]

    const sorted = merged.sort((a, b) => {
      if (a.position === null && b.position === null) return 0
      if (a.position === null) return 1
      if (b.position === null) return -1
      return a.position < b.position ? -1 : a.position > b.position ? 1 : 0
    })

    // // TODO: remove debug log
    // fetch('/auth/kanban-debug-log', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     message: `[KANBAN DEBUG] Column cards for ${col.value}`,
    //     data: {
    //       cards: sorted.map(c => ({ id: c.entryId, pos: c.position, isPending: c.isPending })),
    //       pendingKeys: Array.from(pendingCards.keys())
    //     }
    //   })
    // }).catch(() => {})

    return sorted
  }, [fetchState.cards, pendingCards, col.value])

  return (
    <KanbanColumn
      colValue={col.value}
      label={col.label}
      fetchState={fetchState}
      cards={cards}
      collapsed={collapsed}
      canEdit={canEdit}
      sortActive={sortActive}
      onToggleCollapse={onToggleCollapse}
      onEdit={onEdit}
      onCreateEntry={onCreateEntry}
    />
  )
}

export function ContentKanban({
  seed,
  seedSlug,
  isLoading,
  onEdit,
  onCreateEntry,
  activeFilters = [],
  search = '',
  kanbanConfig,
  setKanbanConfig,
  isSaving,
}: ContentKanbanProps) {
  const compat = React.useMemo(() => resolveKanbanConfig(seed), [seed])

  const axisBranch = React.useMemo(
    () => seed.branches.find(b => b.id === kanbanConfig.axisBranchId),
    [seed.branches, kanbanConfig.axisBranchId],
  )

  const columns = useKanbanColumns(axisBranch, kanbanConfig)

  const [collapsed, setCollapsed] = React.useState<Set<string | null>>(
    () => new Set(kanbanConfig.collapsedColumnValues),
  )

  const toggleCollapse = React.useCallback((value: string | null) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      const key = value ?? '__null__'
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }, [])

  const queryClient = useQueryClient()
  const { state: boardState, dispatch } = useKanbanBoard()
  const [touchDragActive, setTouchDragActive] = React.useState(false)
  const [activeCard, setActiveCard] = React.useState<KanbanCardDisplayModel | null>(null)

  const activeSort = false

  const drag = useKanbanDrag({
    seedSlug,
    axisBranchId: kanbanConfig.axisBranchId ?? '',
    axisBranch: axisBranch!,
    canEdit: DEFAULT_CAN_EDIT,
    activeSort,
    dispatch,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-sm">Caricamento…</div>
      </div>
    )
  }

  if (!compat.compatible) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-muted-foreground text-sm">
          {compat.reason === 'drafts-enabled'
            ? 'Kanban non disponibile per i seed con bozze abilitate.'
            : 'Nessun campo compatibile trovato per la vista Kanban.'}
        </p>
      </div>
    )
  }

  if (!kanbanConfig.axisBranchId) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-sm text-muted-foreground">
          Per favore seleziona un campo per raggruppare le schede dalle impostazioni (icona ingranaggio) in alto a destra.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-full">

      <DndContext
        sensors={drag.sensors}
        collisionDetection={drag.collisionDetection}
        onDragStart={(e) => {
          setTouchDragActive(true)
          drag.onDragStart(e)
          // Look up the dragged card's display model for DragOverlay
          const entryId = String(e.active.id)
          const colValue = (e.active.data.current?.colValue as string | null | undefined) ?? null
          const axisBranchId = kanbanConfig.axisBranchId
          if (axisBranch && axisBranchId) {
            const cached = queryClient.getQueriesData<InfiniteData<ContentListWithMeta>>({
              queryKey: ['kanban', seedSlug, axisBranchId, colValue],
            })
            let found: KanbanCardDisplayModel | null = null
            outer: for (const [, data] of cached) {
              if (!data) continue
              for (const page of data.pages) {
                const item = page.items.find(i => i.id === entryId)
                if (item) { found = buildKanbanCardDisplayModel(item, axisBranch, colValue); break outer }
              }
            }
            setActiveCard(found)
          }
        }}
        onDragMove={drag.onDragMove}
        onDragEnd={(e) => {
          setTouchDragActive(false)
          drag.onDragEnd(e)
          setActiveCard(null)
        }}
        onDragCancel={(e) => {
          setTouchDragActive(false)
          drag.onDragCancel(e)
          setActiveCard(null)
        }}
      >
        <div
          className="flex gap-3 overflow-x-auto pb-4"
          style={{
            display: 'grid',
            gridAutoFlow: 'column',
            gridAutoColumns: `${KANBAN_COLUMN_WIDTH_PX}px`,
            justifyContent: 'center',
            touchAction: touchDragActive ? 'none' : 'pan-y',
          }}
        >
          {axisBranch && columns.map(col => {
            const colKey = col.value ?? '__null__'
            return (
              <KanbanColumnConnected
                key={colKey}
                seedSlug={seedSlug}
                axisBranch={axisBranch}
                col={col}
                config={kanbanConfig}
                activeFilters={activeFilters}
                search={search}
                collapsed={collapsed.has(colKey)}
                canEdit={DEFAULT_CAN_EDIT}
                sortActive={activeSort}
                pendingCards={boardState.pending}
                onToggleCollapse={() => toggleCollapse(col.value)}
                onEdit={onEdit}
                onCreateEntry={onCreateEntry
                  ? () => onCreateEntry(col.value != null ? { [axisBranch.alias]: col.value } : {})
                  : undefined}
              />
            )
          })}
        </div>

        <DragOverlay>
          {activeCard ? <KanbanCardOverlay model={activeCard} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
