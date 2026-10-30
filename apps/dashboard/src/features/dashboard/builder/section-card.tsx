// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from '@/components/icons'
import { DASHBOARD_SECTION_LABEL_MAX, type DashboardPageLayout, type DashboardSection } from '@beechcms/core'
import { FLUSH_MENU } from '@/components/builder/flush-menu'
import { SectionShell } from '@/components/builder/section-shell'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { resolveColumnSpans } from '../renderer/dashboard-section'
import { ColumnCard } from './column-card'
import type { ConfigureTarget } from './widget-block'
import { COLUMN_PRESETS, type DashboardBuilderActions } from './use-dashboard-builder'
import { dragIds } from './use-dashboard-dnd'

export interface SectionCardProps {
  readonly pageId: string
  readonly section: DashboardSection
  readonly otherPages: readonly DashboardPageLayout[]
  readonly ops: DashboardBuilderActions
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

/**
 * A dashboard section: the shared section frame, with the dashboard's menu and its 12-unit column grid.
 * Memoised: its props keep their identity while another section is edited or dragged into.
 */
export const SectionCard = React.memo(function SectionCard({
  pageId,
  section,
  otherPages,
  ops,
  canRemove,
  onConfigureWidget,
}: Readonly<SectionCardProps>) {
  const { t } = useTranslation()
  const widgetCount = section.columns.reduce((sum, c) => sum + c.widgets.length, 0)
  const spans = resolveColumnSpans(section)
  const presetKey = spans.join(',')

  return (
    <SectionShell
      dragId={dragIds.section(pageId, section.id)}
      label={section.label}
      labelMax={DASHBOARD_SECTION_LABEL_MAX}
      noLabelText={t('dashboard.builder.section.noLabel')}
      dragHandleLabel={t('dashboard.builder.section.dragHandle')}
      countText={t('dashboard.builder.section.widgetCount', { count: widgetCount })}
      removeConfirmText={t('dashboard.builder.section.removeConfirm')}
      onRename={(label) => ops.updateSection(pageId, section.id, { label })}
      onRemove={() => ops.removeSection(pageId, section.id)}
      columnDragIds={section.columns.map((c) => dragIds.column(pageId, section.id, c.id))}
      columnsClassName="grid min-w-0 max-w-full grid-cols-12 gap-3 px-3 pb-3"
      renderMenu={({ startRename, requestRemove }) => (
        <>
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
            onSelect={() => requestRemove(widgetCount > 0)}
          >
            {t('dashboard.builder.section.remove')}
          </DropdownMenuItem>
        </>
      )}
    >
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
    </SectionShell>
  )
})
