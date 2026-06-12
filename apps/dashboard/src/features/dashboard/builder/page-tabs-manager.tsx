// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MoreHorizontal, Pencil, Plus } from 'lucide-react'
import type { DashboardPageLayout } from '@beechcms/core'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface PageTabsManagerProps {
  readonly pages: DashboardPageLayout[]
  readonly activePageId: string
  readonly onSetActive: (id: string) => void
  readonly onAddPage: () => void
  readonly onRenamePage: (id: string, label: string) => void
  readonly onRemovePage: (id: string) => void
}

export function PageTabsManager({
  pages,
  activePageId,
  onSetActive,
  onAddPage,
  onRenamePage,
  onRemovePage,
}: PageTabsManagerProps) {
  const { t } = useTranslation()
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState('')

  const dragIds = pages.map((p) => `page:${p.id}`)

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRenamePage(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  return (
    <SortableContext items={dragIds} strategy={horizontalListSortingStrategy}>
      <div className="flex items-center gap-1 flex-wrap">
        {pages.map((page) => (
          <PageTabPill
            key={page.id}
            page={page}
            isActive={page.id === activePageId}
            dragId={`page:${page.id}`}
            isRenaming={renamingId === page.id}
            renameValue={renameValue}
            onSetActive={() => onSetActive(page.id)}
            onStartRename={() => { setRenameValue(page.label); setRenamingId(page.id) }}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenamingId(null)}
            onDelete={() => onRemovePage(page.id)}
            canDelete={pages.length > 1}
          />
        ))}
        <Button type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={onAddPage}>
          <Plus className="size-4" />
          {t('dashboard.builder.page.add')}
        </Button>
      </div>
    </SortableContext>
  )
}

interface PageTabPillProps {
  page: DashboardPageLayout
  isActive: boolean
  dragId: string
  isRenaming: boolean
  renameValue: string
  onSetActive: () => void
  onStartRename: () => void
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onDelete: () => void
  canDelete: boolean
}

function PageTabPill({
  page,
  isActive,
  dragId,
  isRenaming,
  renameValue,
  onSetActive,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  canDelete,
}: Readonly<PageTabPillProps>) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })
  const { role, tabIndex, ...restAttributes } = attributes
  void role
  void tabIndex

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm cursor-pointer select-none border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted/50 border-transparent'}`}
      {...restAttributes}
      {...listeners}
      onClick={onSetActive}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSetActive() }
      }}
    >
      {isRenaming ? (
        <Input
          autoFocus
          className="h-6 text-sm w-24 px-1"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') onRenameCommit()
            if (e.key === 'Escape') onRenameCancel()
          }}
        />
      ) : (
        <span>{page.label}</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ml-1 opacity-60 hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onStartRename}>
            <Pencil className="size-3 mr-2" />{t('dashboard.builder.page.rename')}
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
                {t('dashboard.builder.page.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
