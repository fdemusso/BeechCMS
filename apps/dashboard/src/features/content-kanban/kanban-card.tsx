import * as React from 'react'
import { KANBAN_CARD_HEIGHT_PX } from './constants'
import type { KanbanCardDisplayModel } from './types'

interface KanbanCardProps {
  model: KanbanCardDisplayModel
  canEdit: boolean
  sortActive: boolean
  onEdit: (id: string) => void
  isDragging?: boolean
}

export const KanbanCard = React.memo(function KanbanCard({
  model,
  canEdit,
  sortActive,
  onEdit,
  isDragging = false,
}: KanbanCardProps) {
  return (
    <article
      role="article"
      aria-label={model.title || model.entryId}
      aria-disabled={(!canEdit || model.isPending) || undefined}
      className="flex h-full items-start gap-2 rounded-md border bg-card p-3 shadow-sm transition-shadow select-none hover:shadow-md"
      style={{ boxSizing: 'border-box', minHeight: KANBAN_CARD_HEIGHT_PX }}
      onClick={() => !isDragging && onEdit(model.entryId)}
    >
      {model.imageUrl && (
        <img
          src={model.imageUrl}
          alt=""
          loading="lazy"
          width={40}
          height={40}
          className="shrink-0 rounded object-cover"
          style={{ width: 40, height: 40 }}
          draggable={false}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium leading-tight">{model.title || model.entryId}</p>
        {model.statusBadge && (
          <span className="inline-block w-fit rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {model.statusBadge}
          </span>
        )}
      </div>
    </article>
  )
})
