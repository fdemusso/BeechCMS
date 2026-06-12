// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useTranslation } from 'react-i18next'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import type { DashboardColumn, DashboardPageLayout } from '@beechcms/core'

import { Button } from '@/components/ui/button'
import { WidgetChip } from './widget-chip'

export interface ColumnStackProps {
  readonly pageId: string
  readonly sectionId: string
  readonly column: DashboardColumn
  readonly span?: number
  readonly otherPages: DashboardPageLayout[]
  readonly onAddWidget: () => void
  readonly onConfigureWidget: (widgetId: string) => void
  readonly onRemoveWidget: (widgetId: string) => void
  readonly onMoveWidgetToPage: (widgetId: string, toPageId: string) => void
}

export function ColumnStack({
  pageId,
  sectionId,
  column,
  span,
  otherPages,
  onAddWidget,
  onConfigureWidget,
  onRemoveWidget,
  onMoveWidgetToPage,
}: ColumnStackProps) {
  const { t } = useTranslation()
  const dragIds = column.widgets.map((w) => `widget:${pageId}:${sectionId}:${column.id}:${w.id}`)

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-dashed p-2 min-h-[64px]"
      style={span ? { gridColumn: `span ${span} / span ${span}` } : undefined}
    >
      <SortableContext items={dragIds} strategy={verticalListSortingStrategy}>
        {column.widgets.map((widget) => (
          <WidgetChip
            key={widget.id}
            widget={widget}
            dragId={`widget:${pageId}:${sectionId}:${column.id}:${widget.id}`}
            otherPages={otherPages}
            onConfigure={() => onConfigureWidget(widget.id)}
            onRemove={() => onRemoveWidget(widget.id)}
            onMoveToPage={(toPageId) => onMoveWidgetToPage(widget.id, toPageId)}
          />
        ))}
      </SortableContext>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-center text-muted-foreground border-dashed border h-7"
        onClick={onAddWidget}
      >
        <Plus className="size-3 mr-1" />
        {t('dashboard.builder.widget.add')}
      </Button>
    </div>
  )
}
