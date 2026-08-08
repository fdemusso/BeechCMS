import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { KANBAN_CARD_HEIGHT_PX, KANBAN_CARD_GAP_PX, KANBAN_COLUMN_PADDING_PX } from '../constants'
import type { KanbanCardDisplayModel } from '../types'
import { KanbanCard } from './kanban-card'
import { ScrollArea } from '@/components/ui/scroll-area'

interface KanbanColumnVirtualizerProps {
  cards: KanbanCardDisplayModel[]
  colValue: string | null
  canEdit: boolean
  sortActive: boolean
  onEdit: (id: string) => void
}

interface SortableCardItemProps {
  card: KanbanCardDisplayModel
  colValue: string | null
  canEdit: boolean
  sortActive: boolean
  onEdit: (id: string) => void
  baseStyle: React.CSSProperties
}

function SortableCardItem({ card, colValue, canEdit, sortActive, onEdit, baseStyle }: SortableCardItemProps) {
  const disabled = !canEdit || Boolean(card.isPending)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.entryId,
    disabled,
    data: { colValue, model: card },
  })

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...baseStyle,
          transform: CSS.Transform.toString(transform),
          transition,
          boxSizing: 'border-box',
        }}
      >
        <div
          className="rounded-md border-2 border-dashed border-primary/20 bg-primary/5"
          style={{ boxSizing: 'border-box', height: KANBAN_CARD_HEIGHT_PX }}
        />
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...baseStyle,
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: disabled ? (card.isPending ? 'not-allowed' : 'default') : 'grab',
        zIndex: isDragging ? 1 : undefined,
        boxSizing: 'border-box',
      }}
      {...attributes}
      {...listeners}
    >
      <KanbanCard
        model={card}
        canEdit={canEdit}
        sortActive={sortActive}
        onEdit={onEdit}
        isDragging={isDragging}
      />
    </div>
  )
}

export function KanbanColumnVirtualizer({ cards, colValue, canEdit, sortActive, onEdit }: KanbanColumnVirtualizerProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const itemTotalHeight = KANBAN_CARD_HEIGHT_PX + KANBAN_CARD_GAP_PX

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null,
    estimateSize: () => itemTotalHeight,
    getItemKey: React.useCallback((index: number) => cards[index].entryId, [cards]),
    overscan: 3,
  })

  return (
    <ScrollArea
      ref={scrollRef}
      style={{ flexGrow: 1, minHeight: 0, contain: 'layout paint' }}
    >
      <div style={{ height: virtualizer.getTotalSize() + (KANBAN_COLUMN_PADDING_PX * 2), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map(vItem => (
          <SortableCardItem
            key={vItem.key}
            card={cards[vItem.index]}
            colValue={colValue}
            canEdit={canEdit}
            sortActive={sortActive}
            onEdit={onEdit}
            baseStyle={{
              position: 'absolute',
              top: vItem.start + KANBAN_COLUMN_PADDING_PX,
              left: KANBAN_COLUMN_PADDING_PX,
              right: KANBAN_COLUMN_PADDING_PX,
              height: itemTotalHeight,
              paddingBottom: KANBAN_CARD_GAP_PX,
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

