// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { KANBAN_CARD_HEIGHT_PX } from '../constants'
import { FieldDisplay } from '@/components/fields'
import { cn } from '@/lib/utils'
import { getConditionalFormatCardClass, getConditionalFormatCellClass } from '@/lib/conditional-format'
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
    <button
      type="button"
      aria-label={model.title || model.entryId}
      aria-disabled={(!canEdit || model.isPending) || undefined}
      disabled={!canEdit || model.isPending}
      className={cn(
        'flex h-full w-full flex-col gap-1.5 rounded-md border bg-card p-3 shadow-sm transition-all select-none text-left hover:shadow-md',
        model.isPending && 'opacity-60',
        model.elementStyle && getConditionalFormatCardClass(model.elementStyle.tone, model.elementStyle.textStyles)
      )}
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
            <p className={cn(
              "truncate text-sm font-medium leading-tight",
              slots.header.style && getConditionalFormatCellClass(slots.header.style.tone, slots.header.style.textStyles)
            )}>
              <SlotCell slot={slots.header} maxLength={40} />
            </p>
          )}
          {slots.subtitle && (
            <p className={cn(
              "truncate text-xs text-muted-foreground",
              slots.subtitle.style && getConditionalFormatCellClass(slots.subtitle.style.tone, slots.subtitle.style.textStyles)
            )}>
              <SlotCell slot={slots.subtitle} maxLength={60} />
            </p>
          )}
          {slots.metadata.length > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
              {slots.metadata.map((slot) => (
                <div key={slot.branch.id} className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-muted-foreground truncate">{slot.branch.label}</span>
                  <span className={cn(
                    "text-xs truncate",
                    slot.style && getConditionalFormatCellClass(slot.style.tone, slot.style.textStyles)
                  )}>
                    <SlotCell slot={slot} maxLength={24} compact />
                  </span>
                </div>
              ))}
            </div>
          )}
          {model.statusBadge && (
            <span className={cn(
              "inline-block w-fit rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground mt-auto",
              model.statusStyle && getConditionalFormatCellClass(model.statusStyle.tone, model.statusStyle.textStyles)
            )}>
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
            <p className={cn(
              "truncate text-sm font-medium leading-tight",
              model.titleStyle && getConditionalFormatCellClass(model.titleStyle.tone, model.titleStyle.textStyles)
            )}>{model.title || model.entryId}</p>
            {model.statusBadge && (
              <span className={cn(
                "inline-block w-fit rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground",
                model.statusStyle && getConditionalFormatCellClass(model.statusStyle.tone, model.statusStyle.textStyles)
              )}>
                {model.statusBadge}
              </span>
            )}
          </div>
        </>
      )}
    </button>
  )
})
