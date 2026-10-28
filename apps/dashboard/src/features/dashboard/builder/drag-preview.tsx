// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useTranslation } from 'react-i18next'
import { More as MoreHorizontal } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { GripDots } from '@/components/ui/grip-dots'
import { resolveColumnSpans } from '../renderer/dashboard-section'
import { WidgetGhost } from './ghosts/widget-ghost'
import type { DragPreviewInfo } from './use-dashboard-dnd'

/** The section as the builder draws it: header (handle, name, widget count, menu) and every column's widgets. */
function SectionPreview({ info }: { readonly info: DragPreviewInfo }) {
  const { t } = useTranslation()
  const section = info.section
  const columns = section?.columns ?? []
  const spans = section ? resolveColumnSpans(section) : []
  const widgetCount = columns.reduce((sum, column) => sum + column.widgets.length, 0)
  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center gap-2 px-3 py-2">
        <GripDots className="size-4 text-muted-foreground/60" />
        <span className={`flex-1 text-sm font-medium ${info.label ? '' : 'italic text-muted-foreground'}`}>
          {info.label || t('dashboard.builder.section.noLabel')}
        </span>
        <Badge variant="secondary" className="text-xs">
          {t('dashboard.builder.section.widgetCount', { count: widgetCount })}
        </Badge>
        <MoreHorizontal className="size-4 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-12 gap-3 px-3 pb-3">
        {columns.map((column, index) => (
          <div
            key={column.id}
            style={{ gridColumn: `span ${spans[index]} / span ${spans[index]}` }}
            className={`flex min-h-[48px] min-w-0 flex-col gap-3 rounded-lg ${column.widgets.length === 0 ? 'border' : ''}`}
          >
            {column.widgets.map((widget) => <WidgetGhost key={widget.id} widget={widget} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The item in flight, drawn by the drag overlay at the width of the element that was grabbed. Widgets,
 * columns and sections show their real ghosts (a column is its widgets stacked, a section its header and
 * columns); only a page is a chip with its name.
 */
export function DragPreview({ info }: { readonly info: DragPreviewInfo }) {
  const width = info.width || undefined

  if (info.kind === 'section') {
    return (
      <div style={{ width }} className="cursor-grabbing rounded-lg shadow-xl">
        <SectionPreview info={info} />
      </div>
    )
  }

  if (info.kind === 'widget' && info.widget) {
    return (
      <div style={{ width }} className="cursor-grabbing rounded-2xl bg-background shadow-xl ring-1 ring-border">
        <WidgetGhost widget={info.widget} />
      </div>
    )
  }

  if (info.kind === 'column') {
    return (
      <div style={{ width }} className="flex cursor-grabbing flex-col gap-3 rounded-lg bg-background p-1.5 shadow-xl ring-1 ring-border">
        {(info.widgets ?? []).map((widget) => <WidgetGhost key={widget.id} widget={widget} />)}
      </div>
    )
  }

  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-xl">
      <GripDots className="size-4 text-muted-foreground" />
      {info.label}
    </div>
  )
}
