// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Edit as Pencil, Home, Trash2, X } from '@/components/icons'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'

export interface BuilderTabPillLabels {
  readonly defaultBadge: string
  readonly rename: string
  readonly setDefault: string
  readonly delete: string
}

export interface BuilderTabPillProps {
  readonly label: string
  readonly isActive: boolean
  /** The first tab is the one that opens by default. */
  readonly isDefault: boolean
  readonly dragId: string
  /** The `type` carried on the sortable's data, read by the host's collision logic. */
  readonly dragType: string
  readonly isRenaming: boolean
  readonly renameValue: string
  readonly maxLength: number
  readonly canDelete: boolean
  readonly labels: BuilderTabPillLabels
  readonly onSetActive: () => void
  readonly onStartRename: () => void
  readonly onRenameChange: (value: string) => void
  readonly onRenameCommit: () => void
  readonly onRenameCancel: () => void
  readonly onSetDefault: () => void
  readonly onDelete: () => void
}

/**
 * A sortable tab pill shared by the builders: neutral `muted` selection, home icon on the default tab,
 * double click renames, right click opens the menu and a red X appears on hover.
 */
export function BuilderTabPill({
  label,
  isActive,
  isDefault,
  dragId,
  dragType,
  isRenaming,
  renameValue,
  maxLength,
  canDelete,
  labels,
  onSetActive,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onSetDefault,
  onDelete,
}: Readonly<BuilderTabPillProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
    data: { type: dragType },
  })
  const { role: _role, tabIndex: _tabIndex, ...restAttributes } = attributes

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSetActive()
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          role="button"
          tabIndex={0}
          className={`group/tab flex h-8 shrink-0 items-center rounded-full px-3 text-sm cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={onSetActive}
          onDoubleClick={onStartRename}
          onKeyDown={handleKeyDown}
          {...restAttributes}
          {...listeners}
        >
          {isDefault && !isRenaming && (
            <Home className="mr-1.5 size-3.5 shrink-0" aria-label={labels.defaultBadge} />
          )}
          {isRenaming ? (
            <Input autoFocus maxLength={maxLength} className="h-6 w-24 rounded-md px-1 text-sm focus-visible:ring-1 focus-visible:ring-ring/30" value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={onRenameCommit}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  onRenameCommit()
                }
                if (e.key === 'Escape') {
                  onRenameCancel()
                }
              }}
            />
          ) : (
            <span className="truncate max-w-32">{label}</span>
          )}
          {canDelete && !isRenaming && (
            // The slot is 0 wide until the pill is hovered, then opens to the button's width, so the label
            // does not sit off-centre while the X is hidden.
            <span className="grid grid-cols-[0fr] transition-[grid-template-columns,margin] duration-150 group-hover/tab:ml-1.5 group-hover/tab:grid-cols-[1fr] group-focus-within/tab:ml-1.5 group-focus-within/tab:grid-cols-[1fr]">
              <span className="overflow-hidden">
                <button
                  type="button"
                  aria-label={labels.delete}
                  className="flex size-4 items-center justify-center rounded-full text-destructive opacity-0 transition-opacity hover:bg-destructive/15 group-hover/tab:opacity-100 focus-visible:opacity-100 group-focus-within/tab:opacity-100"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                >
                  <X className="size-3" />
                </button>
              </span>
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onStartRename}>
          <Pencil className="size-4" />
          {labels.rename}
        </ContextMenuItem>
        <ContextMenuItem disabled={isDefault} onSelect={onSetDefault}>
          <Home className="size-4" />
          {labels.setDefault}
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" disabled={!canDelete} onSelect={onDelete}>
          <Trash2 className="size-4" />
          {labels.delete}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
