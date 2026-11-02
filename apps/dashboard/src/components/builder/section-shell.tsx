// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { More as MoreHorizontal } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { GripDots } from '@/components/ui/grip-dots'
import { Input } from '@/components/ui/input'
import { FLUSH_MENU } from './flush-menu'
import { BuilderDragContext } from './layout-dnd'
import { useAnimatedSectionHeight } from './use-animated-section-height'

export interface SectionMenuApi {
  readonly startRename: () => void
  /** Removes the section, asking first when `hasContent`. */
  readonly requestRemove: (hasContent: boolean) => void
}

export interface SectionShellProps {
  readonly dragId: string
  readonly label: string | undefined
  readonly labelMax: number
  readonly noLabelText: string
  readonly dragHandleLabel: string
  readonly countText: string
  readonly removeConfirmText: string
  readonly onRename: (label: string | undefined) => void
  readonly onRemove: () => void
  /** The items of the section's menu; the shell supplies the trigger and the flush container. */
  readonly renderMenu: (api: SectionMenuApi) => React.ReactNode
  /** Drag ids of the section's columns, in order. */
  readonly columnDragIds: readonly string[]
  /** The grid the columns sit in (its template differs: equal columns, or a 12-unit grid). */
  readonly columnsClassName: string
  readonly columnsStyle?: React.CSSProperties
  /**
   * Eases the section's height when an item is dropped in or out of it (see `useAnimatedSectionHeight`). For a host
   * whose box is as tall as its content and centred, where that jump recentres everything. Off by default.
   */
  readonly animateHeight?: boolean
  /** The columns. */
  readonly children: React.ReactNode
}

/**
 * The frame of a section in a layout builder: sortable, a header with the drag handle, an inline-renamable label,
 * a count and a menu, then the columns, then the inline remove confirmation. What the menu offers and what the
 * columns hold belong to the caller.
 *
 * Shared by the entry builder and the dashboard builder.
 */
export function SectionShell({
  dragId,
  label,
  labelMax,
  noLabelText,
  dragHandleLabel,
  countText,
  removeConfirmText,
  onRename,
  onRemove,
  renderMenu,
  columnDragIds,
  columnsClassName,
  columnsStyle,
  animateHeight = false,
  children,
}: Readonly<SectionShellProps>) {
  const { t } = useTranslation()
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState(label ?? '')
  const [showRemoveConfirm, setShowRemoveConfirm] = React.useState(false)

  const { draggingItem } = React.useContext(BuilderDragContext)
  // An item cannot land on a section, only inside it, so while one is dragged the section stops being a
  // droppable (see ColumnShell).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
    data: { type: 'section' },
    disabled: draggingItem ? { droppable: true } : undefined,
  })

  const heightRef = useAnimatedSectionHeight(draggingItem, animateHeight)
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node)
      heightRef.current = node
    },
    [setNodeRef, heightRef],
  )

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Right click anywhere on the section opens the same menu as the "..." button, at the pointer.
  const [contextPoint, setContextPoint] = React.useState<{ x: number; y: number } | null>(null)
  function openContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    // Not for what has a menu of its own (an item's right-click already prevented the default), for text fields
    // (their native menu has copy and paste), for events portalled out of the section (this menu's own items),
    // or mid-drag.
    if (event.defaultPrevented || isDragging || !event.currentTarget.contains(event.target as Node)) return
    if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return
    event.preventDefault()
    setContextPoint({ x: event.clientX, y: event.clientY })
  }

  const startRename = React.useCallback(() => {
    setRenameValue(label ?? '')
    setIsRenaming(true)
  }, [label])
  function commitRename() {
    onRename(renameValue.trim() || undefined)
    setIsRenaming(false)
  }

  // The menu's api keeps its identity across the redraws a drag causes, so a memoised menu is not rebuilt by them.
  const menuApi = React.useMemo<SectionMenuApi>(
    () => ({
      startRename,
      // An empty section has nothing to lose: no confirmation.
      requestRemove: (hasContent) => (hasContent ? setShowRemoveConfirm(true) : onRemove()),
    }),
    [startRename, onRemove],
  )

  return (
    <div ref={setRefs} style={style} className="min-w-0 max-w-full rounded-lg border" onContextMenu={openContextMenu}>
      <div>
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            aria-label={dragHandleLabel}
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripDots className="size-4" />
          </button>

          {isRenaming ? (
            <Input
              autoFocus
              className="h-7 flex-1 rounded-md text-sm focus-visible:ring-1 focus-visible:ring-ring/30"
              value={renameValue}
              maxLength={labelMax}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitRename()
                if (e.key === 'Escape') setIsRenaming(false)
              }}
            />
          ) : (
            <span
              role="button"
              tabIndex={0}
              className={`flex-1 cursor-text text-sm font-medium focus-visible:underline focus-visible:outline-none ${
                label ? '' : 'italic text-muted-foreground'
              }`}
              onDoubleClick={startRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  startRename()
                }
              }}
            >
              {label ?? noLabelText}
            </span>
          )}

          <Badge variant="secondary" className="text-xs">
            {countText}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={FLUSH_MENU}>
              {renderMenu(menuApi)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className={columnsClassName} style={columnsStyle}>
          <SortableContext items={columnDragIds as string[]} strategy={horizontalListSortingStrategy}>
            {children}
          </SortableContext>
        </div>

        {contextPoint &&
          // In a portal on <body>: the builder sits inside a dialog positioned with a CSS transform, which becomes
          // the reference of a `position: fixed` anchor and shifts it away from the pointer.
          createPortal(
            <DropdownMenu open onOpenChange={(open) => { if (!open) setContextPoint(null) }}>
              <DropdownMenuTrigger asChild>
                <span aria-hidden className="pointer-events-none fixed size-0" style={{ left: contextPoint.x, top: contextPoint.y }} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={FLUSH_MENU}>
                {renderMenu(menuApi)}
              </DropdownMenuContent>
            </DropdownMenu>,
            document.body,
          )}

        {showRemoveConfirm && (
          <div className="flex items-center gap-2 px-3 pb-3 text-sm text-muted-foreground">
            <span className="flex-1">{removeConfirmText}</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                onRemove()
                setShowRemoveConfirm(false)
              }}
            >
              {t('common.confirm')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowRemoveConfirm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
