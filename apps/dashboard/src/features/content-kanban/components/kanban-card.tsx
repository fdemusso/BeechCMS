// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { FieldDisplay } from '@/components/fields'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { isStatus } from '@/components/ui/status'
import { cn } from '@/lib/utils'
import { getConditionalFormatCardClass, getConditionalFormatCellClass } from '@/lib/conditional-format'
import { DEFAULT_KANBAN_CARD_OPTIONS, type KanbanCardDisplayModel, type KanbanCardOptions, type ResolvedSlotField } from '../types'

/** Properties for the {@link KanbanCard} component. */
interface KanbanCardProps {
  /** Display data model containing mapped slot fields and metadata. */
  model: KanbanCardDisplayModel
  /** Determines if the card details can be edited. */
  canEdit?: boolean
  /** Active status indicating if drag-and-drop sorting is currently occurring. */
  sortActive: boolean
  /** Callback fired when the card is clicked to edit. */
  onEdit: (id: string) => void
  /** True if the card is currently being dragged. */
  isDragging?: boolean
  /** Density, title wrapping and label visibility. Defaults to the comfortable layout. */
  options?: KanbanCardOptions
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

/** Status of an entry: the shared badge for known statuses, a neutral badge for any other value. */
function CardStatus({ status, className }: { status: string; className?: string }) {
  return isStatus(status)
    ? <StatusBadge status={status} className={className} />
    : <Badge variant="secondary" className={className}>{status}</Badge>
}

/**
 * KanbanCard component.
 * Renders an interactive card on a Kanban board, supporting customized layout slots
 * (media, header, subtitle, metadata grid) or fallback defaults (image, title).
 * The card is as tall as its content; the column virtualizer measures it.
 *
 * @param props - Component properties conforming to {@link KanbanCardProps}.
 */
export const KanbanCard = React.memo(function KanbanCard({
  model,
  canEdit: _canEdit,
  sortActive: _sortActive,
  onEdit,
  isDragging = false,
  options = DEFAULT_KANBAN_CARD_OPTIONS,
}: KanbanCardProps) {
  const { slots } = model
  const compact = options.size === 'compact'
  const titleClass = options.wrapTitle ? 'line-clamp-2 break-words' : 'truncate'
  const titleMax = options.wrapTitle ? 80 : 40

  return (
    <button
      type="button"
      aria-label={model.title || model.entryId}
      aria-disabled={model.isPending || undefined}
      disabled={model.isPending}
      className={cn(
        'flex w-full flex-col rounded-lg border border-border bg-card text-left select-none transition-colors',
        'hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        compact ? 'gap-1 p-2.5' : 'gap-2 p-3',
        model.isPending && 'opacity-60',
        model.elementStyle && getConditionalFormatCardClass(model.elementStyle.tone, model.elementStyle.textStyles)
      )}
      onClick={() => !isDragging && onEdit(model.entryId)}
    >
      {slots ? (
        <>
          {slots.media && (
            <div className="w-full min-w-0 overflow-hidden rounded-control">
              <FieldDisplay branch={slots.media.branch} value={slots.media.value} />
            </div>
          )}
          {slots.header && (
            <div className={cn(
              'text-sm font-medium leading-snug text-foreground',
              titleClass,
              slots.header.style && getConditionalFormatCellClass(slots.header.style.tone, slots.header.style.textStyles)
            )}>
              <SlotCell slot={slots.header} maxLength={titleMax} />
            </div>
          )}
          {slots.subtitle && (
            <div className={cn(
              'truncate text-xs text-muted-foreground',
              slots.subtitle.style && getConditionalFormatCellClass(slots.subtitle.style.tone, slots.subtitle.style.textStyles)
            )}>
              <SlotCell slot={slots.subtitle} maxLength={60} />
            </div>
          )}
          {slots.metadata.length > 0 && (
            <div className={cn(
              compact ? 'flex flex-wrap gap-x-3 gap-y-0.5' : 'grid grid-cols-2 gap-x-3 gap-y-1.5',
              !compact && 'mt-0.5'
            )}>
              {slots.metadata.map((slot) => (
                <div key={slot.branch.id} className="flex min-w-0 flex-col">
                  {options.showFieldLabels && (
                    <span className="truncate text-xs text-muted-foreground">{slot.branch.label}</span>
                  )}
                  <div className={cn(
                    'truncate text-xs text-foreground',
                    slot.style && getConditionalFormatCellClass(slot.style.tone, slot.style.textStyles)
                  )}>
                    <SlotCell slot={slot} maxLength={24} compact />
                  </div>
                </div>
              ))}
            </div>
          )}
          {model.statusBadge && (
            <CardStatus
              status={model.statusBadge}
              className={model.statusStyle ? getConditionalFormatCellClass(model.statusStyle.tone, model.statusStyle.textStyles) : undefined}
            />
          )}
        </>
      ) : (
        <div className="flex min-w-0 items-start gap-2.5">
          {model.imageUrl && (
            <img
              src={model.imageUrl}
              alt=""
              loading="lazy"
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-control object-cover"
              draggable={false}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className={cn(
              'text-sm font-medium leading-snug text-foreground',
              titleClass,
              model.titleStyle && getConditionalFormatCellClass(model.titleStyle.tone, model.titleStyle.textStyles)
            )}>
              {model.titleField
                ? <FieldDisplay branch={model.titleField.branch} value={model.titleField.value} options={{ maxLength: titleMax, compact: true }} />
                : model.title || model.entryId}
            </p>
            {model.statusBadge && (
              <CardStatus
                status={model.statusBadge}
                className={model.statusStyle ? getConditionalFormatCellClass(model.statusStyle.tone, model.statusStyle.textStyles) : undefined}
              />
            )}
          </div>
        </div>
      )}
    </button>
  )
})
