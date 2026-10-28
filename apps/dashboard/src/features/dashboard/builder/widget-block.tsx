// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  ArrowSwapHorizontal as ArrowRightLeft,
  Copy,
  Edit as Pencil,
  Settings2,
  Trash2,
  X,
} from '@/components/icons'
import { DASHBOARD_WIDGET_TITLE_MAX, type DashboardPageLayout, type DashboardWidgetInstance } from '@beechcms/core'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { GripDots } from '@/components/ui/grip-dots'
import { Input } from '@/components/ui/input'
import { getWidgetDefinition, isWidgetDisabled, listWidgetDefinitions } from '../registry/widget-registry'
import { WidgetGhost } from './ghosts/widget-ghost'
import { dragIds } from './use-dashboard-dnd'
import type { UseDashboardBuilderResult } from './use-dashboard-builder'

export interface ConfigureTarget {
  readonly sectionId: string
  readonly columnId: string
  readonly widgetId: string
}

export interface WidgetBlockProps {
  readonly pageId: string
  readonly sectionId: string
  readonly columnId: string
  readonly widget: DashboardWidgetInstance
  /** The column's width on the 12-unit grid, to tell when the widget is cramped. */
  readonly span: number
  readonly otherPages: readonly DashboardPageLayout[]
  readonly ops: UseDashboardBuilderResult
  readonly onConfigure: (target: ConfigureTarget) => void
  readonly onNotice: (message: string) => void
}

/**
 * A widget in a column: its ghost with the controls the builder adds around it. The whole card is the drag
 * handle (a 5px move starts a drag, so a click stays a click); the gear and the red X appear on hover,
 * double click renames the title, right click opens the menu. Memoised: while something is dragged, dnd-kit
 * re-renders every sortable on every pointer move, and the props here keep their identity between moves.
 */
export const WidgetBlock = React.memo(function WidgetBlock({
  pageId,
  sectionId,
  columnId,
  widget,
  span,
  otherPages,
  ops,
  onConfigure,
  onNotice,
}: Readonly<WidgetBlockProps>) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState('')
  const def = getWidgetDefinition(widget.type)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragIds.widget(widget.id),
    data: { type: 'widget', pageId, sectionId, columnId },
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const label = widget.title || (def ? t(def.labelKey) : widget.type)
  const tooNarrow = def?.minColumnSpan !== undefined && span < def.minColumnSpan

  function startRename() {
    setRenameValue(widget.title ?? '')
    setRenaming(true)
  }
  function commitRename() {
    ops.updateWidgetTitle(pageId, sectionId, columnId, widget.id, renameValue.trim() || undefined)
    setRenaming(false)
  }
  function remove() {
    ops.removeWidget(pageId, sectionId, columnId, widget.id)
  }

  const replaceable = listWidgetDefinitions().filter((candidate) => !isWidgetDisabled(candidate.type) && candidate.type !== widget.type)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          aria-label={label}
          className="group/widget relative min-w-0 max-w-full cursor-grab touch-none rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onDoubleClick={startRename}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              onConfigure({ sectionId, columnId, widgetId: widget.id })
            }
          }}
          {...attributes}
          {...listeners}
        >
          <WidgetGhost widget={widget} />

          {/* The handle's only visible hint: it appears with the other controls, on hover. */}
          <GripDots className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground/60 opacity-0 transition-opacity group-hover/widget:opacity-100" />

          {tooNarrow && (
            <span
              title={t('dashboard.builder.widget.tooNarrow')}
              className="absolute bottom-2 right-2 rounded-full bg-background/80 p-1 text-amber-500"
            >
              <AlertTriangle className="size-3.5" />
            </span>
          )}

          {!renaming && (
            <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-control bg-background/80 opacity-0 backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover/widget:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('dashboard.builder.widget.configure')}
                className="text-muted-foreground"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onConfigure({ sectionId, columnId, widgetId: widget.id }) }}
              >
                <Settings2 />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('dashboard.builder.widget.remove')}
                className="text-muted-foreground hover:text-destructive"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); remove() }}
              >
                <X />
              </Button>
            </div>
          )}

          {renaming && (
            <Input
              autoFocus
              maxLength={DASHBOARD_WIDGET_TITLE_MAX}
              value={renameValue}
              placeholder={def ? t(def.labelKey) : widget.type}
              className="absolute left-4 right-4 top-3.5 h-7 rounded-md bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring/30"
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onConfigure({ sectionId, columnId, widgetId: widget.id })}>
          <Settings2 className="size-4" />
          {t('dashboard.builder.widget.configure')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={startRename}>
          <Pencil className="size-4" />
          {t('dashboard.builder.widget.rename')}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => { if (!ops.duplicateWidget(pageId, sectionId, columnId, widget.id)) onNotice(t('dashboard.builder.widget.warnFull')) }}
        >
          <Copy className="size-4" />
          {t('dashboard.builder.widget.duplicate')}
        </ContextMenuItem>
        {replaceable.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t('dashboard.builder.widget.replaceWith')}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-72 overflow-y-auto">
              {replaceable.map((candidate) => (
                <ContextMenuItem
                  key={candidate.type}
                  onSelect={() => ops.replaceWidget(pageId, sectionId, columnId, widget.id, candidate.type)}
                >
                  {t(candidate.labelKey)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {otherPages.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ArrowRightLeft className="size-4" />
              {t('dashboard.builder.widget.moveToPage')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {otherPages.map((page) => (
                <ContextMenuItem
                  key={page.id}
                  onSelect={() => {
                    if (!ops.moveWidgetToPage({ pageId, sectionId, columnId, widgetId: widget.id }, page.id)) {
                      onNotice(t('dashboard.builder.errorMoveWidget'))
                    }
                  }}
                >
                  {page.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={remove}>
          <Trash2 className="size-4" />
          {t('dashboard.builder.widget.remove')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})
