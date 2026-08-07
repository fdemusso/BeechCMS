// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, SortV as GripVertical, More as MoreHorizontal } from 'reicon-react'
import { toast } from 'sonner'
import type { LayoutSection, Branch } from '@beechcms/core'
import { isFullWidthBranch } from '@beechcms/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColumnCard } from './column-card'
import type { UseLayoutBuilderResult } from './use-layout-builder'

interface SectionCardProps {
  readonly tabId: string
  readonly section: LayoutSection
  readonly branchById: Record<string, Branch>
  readonly availableBranches: Branch[]
  readonly ops: UseLayoutBuilderResult
  readonly dragId: string
}

export function SectionCard({
  tabId,
  section,
  branchById,
  availableBranches,
  ops,
  dragId,
}: Readonly<SectionCardProps>) {
  const { t } = useTranslation()
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState(section.label ?? '')
  const [showRemoveConfirm, setShowRemoveConfirm] = React.useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const fieldCount = section.columns.reduce((sum, c) => sum + c.fields.length, 0)

  const hasFullWidthField = section.columns.some((c) =>
    c.fields.some((f) => {
      const b = branchById[f.branchId]
      return b != null && isFullWidthBranch(b)
    })
  )

  function commitRename() {
    ops.renameSection(tabId, section.id, renameValue.trim() || undefined)
    setIsRenaming(false)
  }

  const columnCount = section.columns.length as 1 | 2 | 3 | 4
  const colDragIds = section.columns.map(
    (c) => `column:${tabId}:${section.id}:${c.id}`
  )

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border">
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        {isRenaming ? (
          <Input
            autoFocus
            className="h-7 text-sm flex-1"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setIsRenaming(false)
            }}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            className={`flex-1 text-sm font-medium cursor-text focus-visible:outline-none focus-visible:underline ${
              section.label ? '' : 'text-muted-foreground italic'
            }`}
            onDoubleClick={() => {
              setRenameValue(section.label ?? '')
              setIsRenaming(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setRenameValue(section.label ?? '')
                setIsRenaming(true)
              }
            }}
          >
            {section.label ?? t('layoutBuilder.noLabel')}
          </span>
        )}

        <Badge variant="secondary" className="text-xs">
          {t('layoutBuilder.fieldCount', { count: fieldCount })}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-7">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setRenameValue(section.label ?? '')
                setIsRenaming(true)
              }}
            >
              {t('layoutBuilder.sectionMenu.rename')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => ops.toggleSectionFlag(tabId, section.id, 'hideLabel')}>
              <Check className={section.hideLabel ? 'opacity-100' : 'opacity-0'} />
              {t('layoutBuilder.sectionMenu.hideLabel')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ops.toggleSectionFlag(tabId, section.id, 'hideBorder')}>
              <Check className={section.hideBorder ? 'opacity-100' : 'opacity-0'} />
              {t('layoutBuilder.sectionMenu.hideBorder')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ops.toggleSectionFlag(tabId, section.id, 'collapsible')}>
              <Check className={section.collapsible ? 'opacity-100' : 'opacity-0'} />
              {t('layoutBuilder.sectionMenu.collapsible')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {hasFullWidthField ? (
              <DropdownMenuItem
                className="text-muted-foreground"
                onSelect={() => toast.warning(t('layoutBuilder.warnFullWidthColumns'))}
              >
                {t('layoutBuilder.sectionMenu.columns')}
              </DropdownMenuItem>
            ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('layoutBuilder.sectionMenu.columns')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {([1, 2, 3, 4] as const).map((n) => (
                  <DropdownMenuItem
                    key={n}
                    onSelect={() => ops.setSectionColumnCount(tabId, section.id, n)}
                    className={columnCount === n ? 'font-semibold' : ''}
                  >
                    {n}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setShowRemoveConfirm(true)}
            >
              {t('layoutBuilder.sectionMenu.remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Columns */}
      <div className={`p-3 grid gap-2`} style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
        <SortableContext items={colDragIds} strategy={horizontalListSortingStrategy}>
          {section.columns.map((col) => {
            const colDragId = `column:${tabId}:${section.id}:${col.id}`
            return (
              <ColumnCard
                key={col.id}
                tabId={tabId}
                sectionId={section.id}
                columnId={col.id}
                fields={col.fields}
                branchById={branchById}
                availableBranches={availableBranches}
                ops={ops}
                dragId={colDragId}
              />
            )
          })}
        </SortableContext>
      </div>

      {/* Inline remove confirm */}
      {showRemoveConfirm && (
        <div className="px-3 pb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex-1">{t('layoutBuilder.sectionMenu.remove')}?</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              ops.removeSection(tabId, section.id)
              setShowRemoveConfirm(false)
            }}
          >
            {t('common.confirm')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowRemoveConfirm(false)}
          >
            {t('common.cancel')}
          </Button>
        </div>
      )}
    </div>
  )
}
