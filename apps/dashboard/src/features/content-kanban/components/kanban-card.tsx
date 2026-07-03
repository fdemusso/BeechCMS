// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { KANBAN_CARD_HEIGHT_PX } from '../constants'
import { FieldDisplay } from '@/components/fields'
import type { KanbanCardDisplayModel, ResolvedSlotField } from '../types'

/** Properties for the {@link KanbanCard} component. */
interface KanbanCardProps {
  /** Display data model containing mapped slot fields and metadata. */
  model: KanbanCardDisplayModel
  /** Determines if the card details can be edited. */
  canEdit: boolean
  /** Active status indicating if drag-and-drop sorting is currently occurring. */
  sortActive: boolean
  /** Callback fired when the card is clicked to edit. */
  onEdit: (id: string) => void
  /** True if the card is currently being dragged. */
  isDragging?: boolean
}

/** Properties for the {@link SlotCell} helper component. */
interface SlotCellProps {
  /** The slot configuration and value. */
  slot: ResolvedSlotField
  /** The maximum string length allowed before truncation. */
  maxLength: number
  /** Set true to apply a compact display styling. */
  compact?: boolean
}

/**
 * SlotCell component.
 * Helper component that delegates display rendering to {@link FieldDisplay}.
 */
function SlotCell({ slot, maxLength, compact }: SlotCellProps) {
  return (
    <FieldDisplay
      branch={slot.branch}
      value={slot.value}
      options={{ maxLength, compact }}
    />
  )
}

/**
 * KanbanCard component.
 * Renders an interactive card on a Kanban board, supporting customized layout slots
 * (media, header, subtitle, metadata grid) or fallback defaults (image, title).
 *
 * @param props - Component properties conforming to {@link KanbanCardProps}.
 */
export const KanbanCard = React.memo(function KanbanCard({
  model,
  canEdit,
  sortActive: _sortActive,
  onEdit,
  isDragging = false,
}: KanbanCardProps) {
  const { slots } = model

  return (
    <article
      role="article"
      aria-label={model.title || model.entryId}
      aria-disabled={(!canEdit || model.isPending) || undefined}
      className={`flex h-full flex-col gap-1.5 rounded-md border bg-card p-3 shadow-sm transition-all select-none hover:shadow-md ${model.isPending ? 'opacity-60' : ''}`}
      style={{ boxSizing: 'border-box', minHeight: KANBAN_CARD_HEIGHT_PX }}
      onClick={() => !isDragging && onEdit(model.entryId)}
    >
      {slots ? (
        <>
          {slots.media && (
            <div className="w-full min-w-0 overflow-hidden mb-1">
              <FieldDisplay branch={slots.media.branch} value={slots.media.value} />
            </div>
          )}
          {slots.header && (
            <p className="truncate text-sm font-medium leading-tight">
              <SlotCell slot={slots.header} maxLength={40} />
            </p>
          )}
          {slots.subtitle && (
            <p className="truncate text-xs text-muted-foreground">
              <SlotCell slot={slots.subtitle} maxLength={60} />
            </p>
          )}
          {slots.metadata.length > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
              {slots.metadata.map((slot) => (
                <div key={slot.branch.id} className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-muted-foreground truncate">{slot.branch.label}</span>
                  <span className="text-xs truncate">
                    <SlotCell slot={slot} maxLength={24} compact />
                  </span>
                </div>
              ))}
            </div>
          )}
          {model.statusBadge && (
            <span className="inline-block w-fit rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground mt-auto">
              {model.statusBadge}
            </span>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </article>
  )
})
