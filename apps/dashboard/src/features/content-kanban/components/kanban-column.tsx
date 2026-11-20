import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Plus } from '@/components/icons'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/small-cta'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { KANBAN_CARD_ESTIMATE_HEIGHT_PX, KANBAN_COLUMN_WIDTH_PX } from '../constants'
import type { KanbanCardDisplayModel, KanbanCardOptions, KanbanColumnFetchState } from '../types'
import { KanbanColumnVirtualizer } from './kanban-column-virtualizer'

interface KanbanColumnProps {
  colValue: string | null
  label: string
  /** Option color of a tags-axis column; no dot and no tint when absent. */
  color?: string
  /** Tint the column and its header pill with `color`. Off ⇒ neutral surface. */
  tinted?: boolean
  fetchState: KanbanColumnFetchState
  cards: KanbanCardDisplayModel[]
  cardOptions: KanbanCardOptions
  collapsed: boolean
  canEdit: boolean
  canCreate: boolean
  sortActive: boolean
  /** False on a fallback column: cards can leave it but never be dropped into it. */
  acceptsDrops?: boolean
  onToggleCollapse: () => void
  onEdit: (id: string) => void
  onCreateEntry?: () => void
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Option colors are user data: only a plain #RRGGBB reaches the inline style. */
function safeColor(color: string | undefined): string | undefined {
  return color && HEX_COLOR.test(color) ? color : undefined
}

function SkeletonCard() {
  return <Skeleton className="w-full rounded-lg" style={{ height: KANBAN_CARD_ESTIMATE_HEIGHT_PX }} />
}

export const KanbanColumn = React.memo(function KanbanColumn({
  colValue,
  label,
  color,
  tinted = false,
  fetchState,
  cards,
  cardOptions,
  collapsed,
  canEdit,
  canCreate,
  sortActive,
  acceptsDrops = true,
  onToggleCollapse,
  onEdit,
  onCreateEntry,
}: KanbanColumnProps) {
  const { t } = useTranslation()
  const droppableId = `col:${colValue ?? '__null__'}`
  const { isOver, setNodeRef } = useDroppable({ id: droppableId, data: { colValue }, disabled: !acceptsDrops })

  const { total, hasNextPage, isLoading, isFetching, fetchNextPage } = fetchState
  const loaded = cards.length
  const cardIds = cards.map(c => c.entryId)
  const dot = safeColor(color)
  const tint = tinted ? dot : undefined
  // oklab, never oklch: a hue-interpolated mix pushes the neutral grey towards purple.
  const columnStyle: React.CSSProperties | undefined = tint
    ? { backgroundColor: `color-mix(in oklab, ${tint} 12%, var(--muted))` }
    : undefined
  const pillStyle: React.CSSProperties | undefined = tint
    ? { backgroundColor: `color-mix(in oklab, ${tint} 28%, var(--card))` }
    : undefined
  const showCreate = Boolean(onCreateEntry) && canCreate

  return (
    <section
      aria-label={t('kanban.column.ariaLabel', { label, count: total })}
      className={cn('group/column flex min-w-0 flex-col overflow-hidden rounded-lg', !tint && 'bg-muted')}
      style={{ width: KANBAN_COLUMN_WIDTH_PX, minWidth: KANBAN_COLUMN_WIDTH_PX, flexShrink: 0, ...columnStyle }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            style={pillStyle}
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={t(collapsed ? 'kanban.column.expand' : 'kanban.column.collapse', { label })}
          >
            {dot && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden="true" />}
            <span className="truncate">{label}</span>
            {collapsed ? <ChevronRight className="size-3 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-3 shrink-0 text-muted-foreground" />}
          </button>
          <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
        </div>
        {showCreate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onCreateEntry}
                aria-label={t('kanban.column.newEntryIn', { label })}
                className="opacity-0 transition-opacity group-hover/column:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('kanban.column.newEntryIn', { label })}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* aria-live for keyboard drag announcements (KB-S29) */}
      <div aria-live="polite" className="sr-only" />

      {/* Drop zone — always mounted so collapsed columns accept drops (KB-U06b) */}
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-12 flex-1 flex-col rounded-b-lg transition-colors',
            isOver && 'bg-muted-strong/60'
          )}
        >
          {!collapsed && (
            <>
              {isLoading ? (
                <div className="flex flex-col gap-2 p-2">
                  {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : cards.length === 0 ? (
                <Empty className="flex-1 p-4 md:p-4">
                  <EmptyHeader>
                    <EmptyDescription>{t('kanban.column.empty')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <KanbanColumnVirtualizer
                  cards={cards}
                  colValue={colValue}
                  canEdit={canEdit}
                  sortActive={sortActive}
                  cardOptions={cardOptions}
                  hasLoadMore={hasNextPage}
                  onEdit={onEdit}
                />
              )}

              {!isLoading && hasNextPage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isFetching}
                  onClick={() => fetchNextPage()}
                  className="mx-2 mb-2 shrink-0 text-muted-foreground"
                >
                  {isFetching ? t('kanban.column.loading') : t('kanban.column.loadMore', { count: total - loaded })}
                </Button>
              )}
            </>
          )}
        </div>
      </SortableContext>
    </section>
  )
})
