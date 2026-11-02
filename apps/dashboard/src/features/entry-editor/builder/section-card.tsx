// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from '@/components/icons'
import { toast } from 'sonner'
import type { LayoutSection, Branch } from '@beechcms/core'
import { LAYOUT_SECTION_LABEL_MAX, isFullWidthBranch } from '@beechcms/core'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { ColumnCard } from './column-card'
import { FLUSH_MENU } from '@/components/builder/flush-menu'
import { SectionShell, type SectionMenuApi } from '@/components/builder/section-shell'
import type { LayoutBuilderActions } from './use-layout-builder'
import { dragIds } from './use-builder-dnd'

interface SectionMenuProps {
  readonly tabId: string
  readonly sectionId: string
  readonly hideLabel: boolean
  readonly hideBorder: boolean
  readonly collapsible: boolean
  readonly columnCount: 1 | 2 | 3 | 4
  /** A section holding a full-width field stays in one column. */
  readonly hasFullWidthField: boolean
  readonly fieldCount: number
  readonly api: SectionMenuApi
  readonly ops: LayoutBuilderActions
}

/**
 * The items of a section's menu. Memoised on primitives, apart from the section: dnd-kit redraws every section when
 * the drop target changes, and without this each of those redraws rebuilt a dozen menu elements per section.
 */
const SectionMenu = React.memo(function SectionMenu({
  tabId,
  sectionId,
  hideLabel,
  hideBorder,
  collapsible,
  columnCount,
  hasFullWidthField,
  fieldCount,
  api,
  ops,
}: Readonly<SectionMenuProps>) {
  const { t } = useTranslation()
  return (
    <>
      <DropdownMenuItem onSelect={api.startRename}>{t('layoutBuilder.sectionMenu.rename')}</DropdownMenuItem>
      <DropdownMenuSeparator />
      {/* The toggles keep the menu open so several flags can be set in a row. */}
      <DropdownMenuItem onSelect={(event) => { event.preventDefault(); ops.toggleSectionFlag(tabId, sectionId, 'hideLabel') }}>
        <Check className={hideLabel ? 'opacity-100' : 'opacity-0'} />
        {t('layoutBuilder.sectionMenu.hideLabel')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={(event) => { event.preventDefault(); ops.toggleSectionFlag(tabId, sectionId, 'hideBorder') }}>
        <Check className={hideBorder ? 'opacity-100' : 'opacity-0'} />
        {t('layoutBuilder.sectionMenu.hideBorder')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={(event) => { event.preventDefault(); ops.toggleSectionFlag(tabId, sectionId, 'collapsible') }}>
        <Check className={collapsible ? 'opacity-100' : 'opacity-0'} />
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
          <DropdownMenuSubContent className={FLUSH_MENU}>
            {([1, 2, 3, 4] as const).map((n) => (
              <DropdownMenuItem
                key={n}
                onSelect={(event) => { event.preventDefault(); ops.setSectionColumnCount(tabId, sectionId, n) }}
              >
                <Check className={columnCount === n ? 'opacity-100' : 'opacity-0'} />
                <span className="ml-auto">{n}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive" onSelect={() => api.requestRemove(fieldCount > 0)}>
        {t('layoutBuilder.sectionMenu.remove')}
      </DropdownMenuItem>
    </>
  )
})

interface SectionCardProps {
  readonly tabId: string
  readonly section: LayoutSection
  readonly branchById: Record<string, Branch>
  readonly availableBranches: Branch[]
  readonly ops: LayoutBuilderActions
}

/**
 * An entry-layout section: the shared section frame, with the entry builder's menu and its equal-width columns.
 * Memoised: its props keep their identity while another section is edited or dragged into.
 */
export const SectionCard = React.memo(function SectionCard({
  tabId,
  section,
  branchById,
  availableBranches,
  ops,
}: Readonly<SectionCardProps>) {
  const { t } = useTranslation()
  const sectionId = section.id

  const fieldCount = section.columns.reduce((sum, c) => sum + c.fields.length, 0)
  const hasFullWidthField = section.columns.some((c) =>
    c.fields.some((f) => {
      const b = branchById[f.branchId]
      return b != null && isFullWidthBranch(b)
    })
  )
  const columnCount = section.columns.length as 1 | 2 | 3 | 4

  const onRename = React.useCallback(
    (label: string | undefined) => ops.renameSection(tabId, sectionId, label),
    [ops, tabId, sectionId],
  )
  const onRemove = React.useCallback(() => ops.removeSection(tabId, sectionId), [ops, tabId, sectionId])

  return (
    <SectionShell
      dragId={dragIds.section(tabId, sectionId)}
      label={section.label}
      labelMax={LAYOUT_SECTION_LABEL_MAX}
      noLabelText={t('layoutBuilder.noLabel')}
      dragHandleLabel={t('layoutBuilder.dragSection')}
      countText={t('layoutBuilder.fieldCount', { count: fieldCount })}
      removeConfirmText={`${t('layoutBuilder.sectionMenu.remove')}?`}
      onRename={onRename}
      onRemove={onRemove}
      columnDragIds={section.columns.map((c) => dragIds.column(tabId, sectionId, c.id))}
      columnsClassName="grid min-w-0 max-w-full gap-3 px-3 pb-3"
      columnsStyle={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      // The entry dialog is as tall as its content and centred: a field dropped in another section changes two
      // heights at once and would recentre everything in a single frame.
      animateHeight
      renderMenu={(api) => (
        <SectionMenu
          tabId={tabId}
          sectionId={sectionId}
          hideLabel={!!section.hideLabel}
          hideBorder={!!section.hideBorder}
          collapsible={!!section.collapsible}
          columnCount={columnCount}
          hasFullWidthField={hasFullWidthField}
          fieldCount={fieldCount}
          api={api}
          ops={ops}
        />
      )}
    >
      {section.columns.map((col) => (
        <ColumnCard
          key={col.id}
          tabId={tabId}
          sectionId={sectionId}
          columnId={col.id}
          fields={col.fields}
          branchById={branchById}
          availableBranches={availableBranches}
          ops={ops}
          dragId={dragIds.column(tabId, sectionId, col.id)}
          reorderable={columnCount > 1}
        />
      ))}
    </SectionShell>
  )
})
