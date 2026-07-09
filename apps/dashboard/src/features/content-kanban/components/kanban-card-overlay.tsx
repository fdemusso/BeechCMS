import { KANBAN_CARD_HEIGHT_PX, KANBAN_COLUMN_WIDTH_PX } from '../constants'
import type { KanbanCardDisplayModel } from '../types'

interface KanbanCardOverlayProps {
  model: KanbanCardDisplayModel
}

/** Simplified drag overlay card — title + status badge only, no image (KB-S13). */
export function KanbanCardOverlay({ model }: KanbanCardOverlayProps) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border bg-card p-3 shadow-lg ring-2 ring-primary/30 select-none opacity-95 rotate-1"
      style={{ height: KANBAN_CARD_HEIGHT_PX, width: KANBAN_COLUMN_WIDTH_PX - 8, boxSizing: 'border-box' }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium leading-tight">{model.title || model.entryId}</p>
        {model.statusBadge && (
          <span className="inline-block w-fit rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {model.statusBadge}
          </span>
        )}
      </div>
    </div>
  )
}
