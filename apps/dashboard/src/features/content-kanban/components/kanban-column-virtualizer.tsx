import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { KANBAN_CARD_ESTIMATE_HEIGHT_PX, KANBAN_CARD_GAP_PX, KANBAN_COLUMN_PADDING_PX } from '../constants'
import type { KanbanCardDisplayModel, KanbanCardOptions } from '../types'
import { KanbanCard } from './kanban-card'
import { ScrollArea } from '@/components/ui/scroll-area'

/** Column header: top padding, pill and bottom padding. */
const COLUMN_HEADER_PX = 40
/** The load-more row under the list, when it is shown. */
const COLUMN_LOAD_MORE_PX = 36

/**
 * Tallest the card list grows before it scrolls inside the column. The board publishes the room left in
 * the page as --kanban-board-max; the column's own chrome is taken off so the column ends exactly there.
 */
// design-ok: --kanban-board-max is set at runtime by the board (useBoardMaxHeight in content-kanban.tsx)
const listMaxHeight = (hasLoadMore: boolean) =>
  `calc(var(--kanban-board-max, calc(100vh - 14rem)) - ${COLUMN_HEADER_PX + (hasLoadMore ? COLUMN_LOAD_MORE_PX : 0)}px)`

interface KanbanColumnVirtualizerProps {
  cards: KanbanCardDisplayModel[]
  colValue: string | null
  canEdit: boolean
  sortActive: boolean
  cardOptions: KanbanCardOptions
  /** True when the load-more row sits under the list and takes part of the column height. */
  hasLoadMore?: boolean
  onEdit: (id: string) => void
}

interface SortableCardItemProps {
  card: KanbanCardDisplayModel
  colValue: string | null
  canEdit: boolean
  sortActive: boolean
  cardOptions: KanbanCardOptions
  onEdit: (id: string) => void
  index: number
  start: number
  measureElement: (node: Element | null) => void
}

function SortableCardItem({ card, colValue, canEdit, sortActive, cardOptions, onEdit, index, start, measureElement }: SortableCardItemProps) {
  const disabled = !canEdit || Boolean(card.isPending)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.entryId,
    disabled,
    data: { colValue, model: card },
  })

  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node)
    measureElement(node)
  }, [setNodeRef, measureElement])

  const style: React.CSSProperties = {
    position: 'absolute',
    top: start,
    left: KANBAN_COLUMN_PADDING_PX,
    right: KANBAN_COLUMN_PADDING_PX,
    paddingBottom: KANBAN_CARD_GAP_PX,
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: disabled ? (card.isPending ? 'not-allowed' : 'default') : 'grab',
  }

  return (
    <div ref={setRefs} data-index={index} style={style} {...attributes} {...listeners}>
      {isDragging ? (
        // The slot keeps the card's own height (the card stays in the layout, invisible), so the list does not jump.
        <div className="rounded-lg border border-dashed border-border bg-muted-strong">
          <div className="invisible" aria-hidden="true">
            <KanbanCard model={card} canEdit={false} sortActive={sortActive} onEdit={onEdit} options={cardOptions} />
          </div>
        </div>
      ) : (
        <KanbanCard
          model={card}
          canEdit={canEdit}
          sortActive={sortActive}
          onEdit={onEdit}
          isDragging={isDragging}
          options={cardOptions}
        />
      )}
    </div>
  )
}

export function KanbanColumnVirtualizer({ cards, colValue, canEdit, sortActive, cardOptions, hasLoadMore = false, onEdit }: KanbanColumnVirtualizerProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null,
    estimateSize: () => KANBAN_CARD_ESTIMATE_HEIGHT_PX + KANBAN_CARD_GAP_PX,
    getItemKey: React.useCallback((index: number) => cards[index].entryId, [cards]),
    paddingStart: KANBAN_COLUMN_PADDING_PX,
    overscan: 3,
  })

  return (
    <ScrollArea ref={scrollRef} style={{ maxHeight: listMaxHeight(hasLoadMore), minHeight: 0 }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map(vItem => (
          <SortableCardItem
            key={vItem.key}
            card={cards[vItem.index]}
            colValue={colValue}
            canEdit={canEdit}
            sortActive={sortActive}
            cardOptions={cardOptions}
            onEdit={onEdit}
            index={vItem.index}
            start={vItem.start}
            measureElement={virtualizer.measureElement}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
