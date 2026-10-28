// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { Plus } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { DashboardColumn, DashboardPageLayout } from '@beechcms/core'
import { Button } from '@/components/ui/button'
import { GripDots } from '@/components/ui/grip-dots'
import { WidgetBlock, type ConfigureTarget } from './widget-block'
import { WidgetPickerMenu } from './widget-picker-menu'
import { DashboardDragContext, dragIds } from './use-dashboard-dnd'
import type { UseDashboardBuilderResult } from './use-dashboard-builder'

const notify = (message: string) => { toast.warning(message) }

export interface ColumnCardProps {
  readonly pageId: string
  readonly sectionId: string
  readonly column: DashboardColumn
  /** Width on the 12-unit grid. */
  readonly span: number
  readonly otherPages: readonly DashboardPageLayout[]
  readonly ops: UseDashboardBuilderResult
  readonly onConfigureWidget: (target: ConfigureTarget) => void
  /** Whether the column can be dragged to swap places: false when it is its section's only column. */
  readonly reorderable: boolean
}

/**
 * A column of a section: its widgets as ghosts, and the Add widget button. Borderless at rest; it is outlined
 * only while it has nothing in it (so there is somewhere to click) or while a widget is being dragged (so there
 * is somewhere to drop). Its whole body is a drop zone, so a widget can land in an empty column.
 */
export function ColumnCard({
  pageId,
  sectionId,
  column,
  span,
  otherPages,
  ops,
  onConfigureWidget,
  reorderable,
}: Readonly<ColumnCardProps>) {
  const { t } = useTranslation()
  const columnId = column.id

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragIds.column(pageId, sectionId, columnId),
    data: { type: 'column' },
  })
  const { setNodeRef: setZoneRef } = useDroppable({
    id: dragIds.zone(pageId, sectionId, columnId),
    data: { type: 'zone', pageId, sectionId, columnId },
  })
  const { draggingWidget, activeColumnKey } = React.useContext(DashboardDragContext)
  const isActiveColumn = draggingWidget && activeColumnKey === `${pageId}:${sectionId}:${columnId}`

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    gridColumn: `span ${span} / span ${span}`,
  }

  const widgetDragIds = column.widgets.map((widget) => dragIds.widget(widget.id))

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/column relative flex min-h-[48px] min-w-0 max-w-full flex-col rounded-lg border border-transparent transition-colors',
        // Dragging a widget: every column gets a thin solid outline, the one under it a darker grey and a faint fill.
        (column.widgets.length === 0 || draggingWidget) && 'border-border',
        isActiveColumn && 'border-foreground/25 bg-muted/50',
      )}
    >
      {reorderable && (
        <button
          type="button"
          aria-label={t('dashboard.builder.column.drag')}
          className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 cursor-grab touch-none rounded-md px-2 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-hover/column:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripDots className="size-4 rotate-90" />
        </button>
      )}

      {/* The zone fills the column's inside (its 48px minimum already includes the border). An empty column
          holds only the Add widget button, which gets a margin so its hover does not touch the outline. */}
      <div ref={setZoneRef} className={cn('flex flex-1 flex-col gap-3', column.widgets.length === 0 && 'justify-center p-1.5')}>
        <SortableContext items={widgetDragIds} strategy={verticalListSortingStrategy}>
          {column.widgets.map((widget) => (
            <WidgetBlock
              key={widget.id}
              pageId={pageId}
              sectionId={sectionId}
              columnId={columnId}
              widget={widget}
              span={span}
              otherPages={otherPages}
              ops={ops}
              onConfigure={onConfigureWidget}
              onNotice={notify}
            />
          ))}
        </SortableContext>

        <WidgetPickerMenu
          onSelect={(type) => {
            if (!ops.addWidget(pageId, sectionId, columnId, type)) toast.warning(t('dashboard.builder.warnColumnFull'))
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-center text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          >
            <Plus className="mr-1 size-3" />
            {t('dashboard.builder.widget.add')}
          </Button>
        </WidgetPickerMenu>
      </div>
    </div>
  )
}
