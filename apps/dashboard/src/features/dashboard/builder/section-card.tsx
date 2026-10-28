// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Copy, More as MoreHorizontal } from '@/components/icons'
import { DASHBOARD_SECTION_LABEL_MAX, type DashboardPageLayout, type DashboardSection } from '@beechcms/core'
import { FLUSH_MENU } from '@/components/builder/flush-menu'
import { useAnimatedSectionHeight } from '@/components/builder/use-animated-section-height'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { GripDots } from '@/components/ui/grip-dots'
import { Input } from '@/components/ui/input'
import { resolveColumnSpans } from '../renderer/dashboard-section'
import { ColumnCard } from './column-card'
import type { ConfigureTarget } from './widget-block'
import { COLUMN_PRESETS, type UseDashboardBuilderResult } from './use-dashboard-builder'
import { DashboardDragContext, dragIds } from './use-dashboard-dnd'

export interface SectionCardProps {
  readonly pageId: string
  readonly section: DashboardSection
  readonly otherPages: readonly DashboardPageLayout[]
  readonly ops: UseDashboardBuilderResult
  /** A page keeps at least one section (the server requires it). */
  readonly canRemove: boolean
  readonly onConfigureWidget: (target: ConfigureTarget) => void
}

/** The widths of a column preset as a row of proportional bars, so `[8, 4]` reads at a glance. */
function PresetDiagram({ spans }: { readonly spans: readonly number[] }) {
  return (
    <span aria-hidden data-spans={spans.join(',')} className="ml-auto flex h-3 w-16 gap-0.5">
      {spans.map((span, index) => (
        <span key={index} className="rounded-[2px] bg-foreground/25" style={{ flex: span }} />
      ))}
    </span>
  )
}

export function SectionCard({ pageId, section, otherPages, ops, canRemove, onConfigureWidget }: Readonly<SectionCardProps>) {
  const { t } = useTranslation()
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState(section.label ?? '')
  const [showRemoveConfirm, setShowRemoveConfirm] = React.useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragIds.section(pageId, section.id),
    data: { type: 'section' },
  })

  // While a widget is in flight the section may only grow, so lifting a widget out of its column does not
  // shrink it under the pointer; it eases to its real height at the drop.
  const { draggingWidget } = React.useContext(DashboardDragContext)
  const heightLock = useAnimatedSectionHeight(draggingWidget)
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node)
      heightLock.outerRef.current = node
    },
    [setNodeRef, heightLock.outerRef],
  )

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    // The sortable's own transition (while another section is dragged past) and the height's, together.
    transition: [transition, heightLock.style?.transition].filter(Boolean).join(', ') || undefined,
    opacity: isDragging ? 0.5 : 1,
    height: heightLock.style?.height,
    overflow: heightLock.style?.overflow,
  }

  const widgetCount = section.columns.reduce((sum, c) => sum + c.widgets.length, 0)
  const spans = resolveColumnSpans(section)
  const presetKey = spans.join(',')
  const columnDragIds = section.columns.map((c) => dragIds.column(pageId, section.id, c.id))

  function startRename() {
    setRenameValue(section.label ?? '')
    setIsRenaming(true)
  }
  function commitRename() {
    ops.updateSection(pageId, section.id, { label: renameValue.trim() || undefined })
    setIsRenaming(false)
  }

  return (
    <div ref={setRefs} style={style} className="min-w-0 max-w-full rounded-lg border">
      <div ref={heightLock.innerRef as React.RefObject<HTMLDivElement>}>
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            aria-label={t('dashboard.builder.section.dragHandle')}
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
              maxLength={DASHBOARD_SECTION_LABEL_MAX}
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
                section.label ? '' : 'italic text-muted-foreground'
              }`}
              onDoubleClick={startRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  startRename()
                }
              }}
            >
              {section.label ?? t('dashboard.builder.section.noLabel')}
            </span>
          )}

          <Badge variant="secondary" className="text-xs">
            {t('dashboard.builder.section.widgetCount', { count: widgetCount })}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={FLUSH_MENU}>
              <DropdownMenuItem onSelect={startRename}>{t('dashboard.builder.section.rename')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* The toggles keep the menu open so several flags can be set in a row. */}
              <DropdownMenuItem onSelect={(event) => { event.preventDefault(); ops.toggleSectionFlag(pageId, section.id, 'hideLabel') }}>
                <Check className={section.hideLabel ? 'opacity-100' : 'opacity-0'} />
                {t('dashboard.builder.section.hideLabel')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={(event) => { event.preventDefault(); ops.toggleSectionFlag(pageId, section.id, 'collapsible') }}>
                <Check className={section.collapsible ? 'opacity-100' : 'opacity-0'} />
                {t('dashboard.builder.section.collapsible')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t('dashboard.builder.section.columns')}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={FLUSH_MENU}>
                  {COLUMN_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.join(',')}
                      onSelect={(event) => { event.preventDefault(); ops.setColumnPreset(pageId, section.id, [...preset]) }}
                    >
                      <Check className={presetKey === preset.join(',') ? 'opacity-100' : 'opacity-0'} />
                      <PresetDiagram spans={preset} />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => ops.duplicateSection(pageId, section.id)}>
                <Copy className="size-4" />
                {t('dashboard.builder.section.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                disabled={!canRemove}
                // An empty section has nothing to lose: no confirmation.
                onSelect={() => (widgetCount === 0 ? ops.removeSection(pageId, section.id) : setShowRemoveConfirm(true))}
              >
                {t('dashboard.builder.section.remove')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid min-w-0 max-w-full grid-cols-12 gap-3 px-3 pb-3">
          <SortableContext items={columnDragIds} strategy={horizontalListSortingStrategy}>
            {section.columns.map((column, index) => (
              <ColumnCard
                key={column.id}
                pageId={pageId}
                sectionId={section.id}
                column={column}
                span={spans[index]}
                otherPages={otherPages}
                ops={ops}
                onConfigureWidget={onConfigureWidget}
                reorderable={section.columns.length > 1}
              />
            ))}
          </SortableContext>
        </div>

        {showRemoveConfirm && (
          <div className="flex items-center gap-2 px-3 pb-3 text-sm text-muted-foreground">
            <span className="flex-1">{t('dashboard.builder.section.removeConfirm')}</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                ops.removeSection(pageId, section.id)
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
