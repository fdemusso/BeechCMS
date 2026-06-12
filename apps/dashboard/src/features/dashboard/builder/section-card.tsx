// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Copy, GripVertical, MoreHorizontal } from 'lucide-react'
import type { DashboardSection, DashboardPageLayout } from '@beechcms/core'

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
import { ColumnStack } from './column-stack'
import { COLUMN_PRESETS } from './use-dashboard-builder'

export interface SectionCardProps {
  readonly pageId: string
  readonly section: DashboardSection
  readonly dragId: string
  readonly otherPages: DashboardPageLayout[]
  readonly canRemove: boolean
  readonly onUpdate: (updates: Partial<Pick<DashboardSection, 'label' | 'hideLabel' | 'collapsible'>>) => void
  readonly onSetColumnPreset: (spans: number[]) => void
  readonly onDuplicate: () => void
  readonly onRemove: () => void
  readonly onAddWidget: (columnId: string) => void
  readonly onConfigureWidget: (columnId: string, widgetId: string) => void
  readonly onRemoveWidget: (columnId: string, widgetId: string) => void
  readonly onMoveWidgetToPage: (columnId: string, widgetId: string, toPageId: string) => void
}

export function SectionCard({
  pageId,
  section,
  dragId,
  otherPages,
  canRemove,
  onUpdate,
  onSetColumnPreset,
  onDuplicate,
  onRemove,
  onAddWidget,
  onConfigureWidget,
  onRemoveWidget,
  onMoveWidgetToPage,
}: SectionCardProps) {
  const { t } = useTranslation()
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState(section.label ?? '')

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function commitRename() {
    onUpdate({ label: renameValue.trim() || undefined })
    setIsRenaming(false)
  }

  const spans = section.columnSpans ?? section.columns.map(() => 12 / section.columns.length)
  const currentPresetKey = spans.join(',')

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <button type="button" className="cursor-grab text-muted-foreground hover:text-foreground" {...attributes} {...listeners}>
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
            className={`flex-1 text-sm font-medium cursor-text ${section.label ? '' : 'text-muted-foreground italic'}`}
            onDoubleClick={() => { setRenameValue(section.label ?? ''); setIsRenaming(true) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setRenameValue(section.label ?? '')
                setIsRenaming(true)
              }
            }}
          >
            {section.label ?? t('dashboard.builder.section.noLabel')}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-7">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => { setRenameValue(section.label ?? ''); setIsRenaming(true) }}>
              {t('dashboard.builder.section.rename')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onUpdate({ hideLabel: !section.hideLabel })}>
              <Check className={section.hideLabel ? 'opacity-100' : 'opacity-0'} />
              {t('dashboard.builder.section.hideLabel')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onUpdate({ collapsible: !section.collapsible })}>
              <Check className={section.collapsible ? 'opacity-100' : 'opacity-0'} />
              {t('dashboard.builder.section.collapsible')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('dashboard.builder.section.columns')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {COLUMN_PRESETS.map((preset) => (
                  <DropdownMenuItem
                    key={preset.join(',')}
                    className={currentPresetKey === preset.join(',') ? 'font-semibold' : ''}
                    onSelect={() => onSetColumnPreset([...preset])}
                  >
                    [{preset.join(', ')}]
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="size-3.5 mr-2" />
              {t('dashboard.builder.section.duplicate')}
            </DropdownMenuItem>
            {canRemove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onSelect={onRemove}>
                  {t('dashboard.builder.section.remove')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-3 grid grid-cols-12 gap-2">
        {section.columns.map((col, idx) => (
          <ColumnStack
            key={col.id}
            pageId={pageId}
            sectionId={section.id}
            column={col}
            span={spans[idx]}
            otherPages={otherPages}
            onAddWidget={() => onAddWidget(col.id)}
            onConfigureWidget={(widgetId) => onConfigureWidget(col.id, widgetId)}
            onRemoveWidget={(widgetId) => onRemoveWidget(col.id, widgetId)}
            onMoveWidgetToPage={(widgetId, toPageId) => onMoveWidgetToPage(col.id, widgetId, toPageId)}
          />
        ))}
      </div>
    </div>
  )
}
