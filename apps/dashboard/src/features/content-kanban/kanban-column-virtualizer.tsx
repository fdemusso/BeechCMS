import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { KANBAN_CARD_HEIGHT_PX } from './constants'
import type { KanbanCardDisplayModel } from './types'
import { KanbanCard } from './kanban-card'

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
    data: { colValue },
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
        className="rounded-md border-2 border-dashed border-primary/20 bg-primary/5"
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...baseStyle,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: card.isPending ? 0.6 : 1,
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

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => KANBAN_CARD_HEIGHT_PX,
    getItemKey: React.useCallback((index: number) => cards[index].entryId, [cards]),
    overscan: 3,
  })

  return (
    <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 14rem)', contain: 'layout paint' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
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
              top: vItem.start,
              left: 0,
              right: 0,
              height: KANBAN_CARD_HEIGHT_PX,
              padding: '0 4px 4px',
            }}
          />
        ))}
      </div>
    </div>
  )
}
