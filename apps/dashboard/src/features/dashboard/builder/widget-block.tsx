// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  AlertTriangle,
  ArrowSwapHorizontal as ArrowRightLeft,
  Copy,
  Edit as Pencil,
  Lock,
  Settings2,
  Trash2,
  X,
} from '@/components/icons'
import {
  DASHBOARD_WIDGET_TITLE_MAX,
  type DashboardPageLayout,
  type DashboardWidgetInstance,
  type EffectivePermissions,
} from '@beechcms/core'
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
import {
  getWidgetDefinition,
  isWidgetDefinitionUsable,
  isWidgetDisabled,
  listWidgetDefinitions,
} from '../registry/widget-registry'
import { WidgetGhost } from './ghosts/widget-ghost'
import { dragIds } from './use-dashboard-dnd'
import { isLockedWidget } from './locked-widgets'
import type { DashboardBuilderActions } from './use-dashboard-builder'

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
  readonly ops: DashboardBuilderActions
  /** The author's authority: a widget it cannot use is not offered as a replacement. */
  readonly permissions: EffectivePermissions
  readonly onConfigure: (target: ConfigureTarget) => void
  readonly onNotice: (message: string) => void
}

interface WidgetMenuProps {
  readonly pageId: string
  readonly sectionId: string
  readonly columnId: string
  readonly widget: DashboardWidgetInstance
  readonly otherPages: readonly DashboardPageLayout[]
  readonly ops: DashboardBuilderActions
  readonly permissions: EffectivePermissions
  readonly onConfigure: () => void
  readonly onRename: () => void
  readonly onRemove: () => void
  readonly onNotice: (message: string) => void
}

/**
 * The widget's right-click menu. Apart from the block on purpose: dnd-kit redraws every sortable on every
 * pointer move, and with the menu inline each of those redraws rebuilt a dozen menu elements and the list of
 * replaceable widgets for every widget on the page. Here it is built only when the widget itself changes.
 * (dnd-kit redraws every sortable when the drop target changes and after droppables are re-measured, which a
 * live move to another column triggers more than once.)
 */
const WidgetMenu = React.memo(function WidgetMenu({
  pageId,
  sectionId,
  columnId,
  widget,
  otherPages,
  ops,
  permissions,
  onConfigure,
  onRename,
  onRemove,
  onNotice,
}: Readonly<WidgetMenuProps>) {
  const { t } = useTranslation()
  const replaceable = React.useMemo(
    () => listWidgetDefinitions().filter(
      (candidate) =>
        !isWidgetDisabled(candidate.type) &&
        candidate.type !== widget.type &&
        isWidgetDefinitionUsable(candidate, permissions),
    ),
    [widget.type, permissions],
  )

  return (
    <ContextMenuContent>
      <ContextMenuItem onSelect={onConfigure}>
        <Settings2 className="size-4" />
        {t('dashboard.builder.widget.configure')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onRename}>
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
      <ContextMenuItem variant="destructive" onSelect={onRemove}>
        <Trash2 className="size-4" />
        {t('dashboard.builder.widget.remove')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
})

/** The gear and the red X shown on hover. Memoised for the same reason as the menu. */
const WidgetControls = React.memo(function WidgetControls({
  onConfigure,
  onRemove,
}: Readonly<{ onConfigure: () => void; onRemove: () => void }>) {
  const { t } = useTranslation()
  return (
    <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-control bg-popover/80 opacity-0 backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover/widget:opacity-100">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('dashboard.builder.widget.configure')}
        className="text-muted-foreground"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onConfigure() }}
      >
        <Settings2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('dashboard.builder.widget.remove')}
        className="text-muted-foreground hover:text-status-danger-foreground"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove() }}
      >
        <X />
      </Button>
    </div>
  )
})

/**
 * A widget in a column: its ghost with the controls the builder adds around it. The whole card is the drag
 * handle (a 5px move starts a drag, so a click stays a click); the gear and the red X appear on hover,
 * double click renames the title, right click opens the menu.
 *
 * While something is dragged dnd-kit redraws every draggable whenever the drop target changes, and memoising the
 * block does not stop that (the redraw comes from its context, not its props). So what runs on each of those
 * redraws is kept to the block's own box; the ghost, the controls and the menu are memoised parts with stable
 * props.
 */
export const WidgetBlock = React.memo(function WidgetBlock({
  pageId,
  sectionId,
  columnId,
  widget,
  span,
  otherPages,
  ops,
  permissions,
  onConfigure,
  onNotice,
}: Readonly<WidgetBlockProps>) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState('')
  const def = getWidgetDefinition(widget.type)
  const widgetId = widget.id
  const title = widget.title

  const locked = isLockedWidget(widget)
  // Draggable and droppable, not sortable: a widget never moves while it is dragged (the column marks where it
  // would land), so there are no positions to recompute and nothing to animate. A locked widget is still a drop
  // target, so other widgets can be ordered around it.
  const id = dragIds.widget(widgetId)
  const data = React.useMemo(
    () => ({ type: 'widget', rootId: pageId, sectionId, columnId }),
    [pageId, sectionId, columnId],
  )
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id, data, disabled: locked })
  const { setNodeRef: setDropRef } = useDroppable({ id, data })
  const setNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )
  const style: React.CSSProperties = { opacity: isDragging ? 0.4 : 1 }

  const label = title || (def ? t(def.labelKey) : widget.type)
  const tooNarrow = def?.minColumnSpan !== undefined && span < def.minColumnSpan

  const configure = React.useCallback(
    () => onConfigure({ sectionId, columnId, widgetId }),
    [onConfigure, sectionId, columnId, widgetId],
  )
  const startRename = React.useCallback(() => {
    setRenameValue(title ?? '')
    setRenaming(true)
  }, [title])
  const remove = React.useCallback(
    () => ops.removeWidget(pageId, sectionId, columnId, widgetId),
    [ops, pageId, sectionId, columnId, widgetId],
  )
  function commitRename() {
    ops.updateWidgetTitle(pageId, sectionId, columnId, widgetId, renameValue.trim() || undefined)
    setRenaming(false)
  }

  // The server's opaque stand-in for a widget this author cannot use: nothing to configure, move or remove.
  if (locked) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        title={t('dashboard.builder.widget.lockedHint')}
        className="flex items-center gap-2 rounded-lg border border-dashed bg-muted px-3 py-3 text-sm text-muted-foreground"
      >
        <Lock className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{t('dashboard.builder.widget.locked')}</span>
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          aria-label={label}
          className="group/widget relative min-w-0 max-w-full cursor-grab touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onDoubleClick={startRename}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              configure()
            }
          }}
          {...attributes}
          {...listeners}
        >
          <WidgetGhost widget={widget} />

          {/* The handle's only visible hint: it appears with the other controls, on hover. */}
          <span className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 cursor-grab items-center rounded-control border bg-popover px-0.5 py-3 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/widget:opacity-100">
            <GripDots className="size-6" />
          </span>

          {tooNarrow && (
            <span
              title={t('dashboard.builder.widget.tooNarrow')}
              className="absolute bottom-2 right-2 rounded-full bg-popover/80 p-1 text-status-warning-foreground"
            >
              <AlertTriangle className="size-3.5" />
            </span>
          )}

          {!renaming && <WidgetControls onConfigure={configure} onRemove={remove} />}

          {renaming && (
            <Input
              autoFocus
              maxLength={DASHBOARD_WIDGET_TITLE_MAX}
              value={renameValue}
              placeholder={def ? t(def.labelKey) : widget.type}
              className="absolute left-4 right-4 top-3.5 h-7 rounded-control bg-background px-2 text-sm focus-visible:ring-1 focus-visible:ring-ring/30"
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
      <WidgetMenu
        pageId={pageId}
        sectionId={sectionId}
        columnId={columnId}
        widget={widget}
        otherPages={otherPages}
        ops={ops}
        permissions={permissions}
        onConfigure={configure}
        onRename={startRename}
        onRemove={remove}
        onNotice={onNotice}
      />
    </ContextMenu>
  )
})
