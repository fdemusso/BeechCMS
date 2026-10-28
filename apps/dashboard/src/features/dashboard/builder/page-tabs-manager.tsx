// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from '@/components/icons'
import { DASHBOARD_PAGE_LABEL_MAX, type DashboardPageLayout } from '@beechcms/core'
import { BuilderTabPill } from '@/components/builder/tab-pill'
import { Button } from '@/components/ui/button'
import { dragIds } from './use-dashboard-dnd'

export interface PageTabsManagerProps {
  readonly pages: DashboardPageLayout[]
  readonly activePageId: string
  readonly canAdd: boolean
  readonly onSetActive: (id: string) => void
  readonly onAddPage: () => void
  readonly onRenamePage: (id: string, label: string) => void
  readonly onRemovePage: (id: string) => void
  /** Moves a page to the first position, where the dashboard opens on it. */
  readonly onSetDefault: (id: string) => void
}

/** The page strip: the same pills as the entry layout builder; the first page is the one the dashboard opens on. */
export function PageTabsManager({
  pages,
  activePageId,
  canAdd,
  onSetActive,
  onAddPage,
  onRenamePage,
  onRemovePage,
  onSetDefault,
}: Readonly<PageTabsManagerProps>) {
  const { t } = useTranslation()
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState('')

  function commitRename() {
    if (renamingId && renameValue.trim()) onRenamePage(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  const labels = {
    defaultBadge: t('dashboard.builder.page.defaultBadge'),
    rename: t('dashboard.builder.page.rename'),
    setDefault: t('dashboard.builder.page.setDefault'),
    delete: t('dashboard.builder.page.delete'),
  }

  return (
    <SortableContext items={pages.map((page) => dragIds.page(page.id))} strategy={horizontalListSortingStrategy}>
      <div className="flex flex-wrap items-center gap-0.5">
        {pages.map((page, index) => (
          <BuilderTabPill
            key={page.id}
            label={page.label}
            isActive={page.id === activePageId}
            isDefault={index === 0}
            dragId={dragIds.page(page.id)}
            dragType="page"
            isRenaming={renamingId === page.id}
            renameValue={renameValue}
            maxLength={DASHBOARD_PAGE_LABEL_MAX}
            canDelete={pages.length > 1}
            labels={labels}
            onSetActive={() => onSetActive(page.id)}
            onStartRename={() => { setRenameValue(page.label); setRenamingId(page.id) }}
            onRenameChange={setRenameValue}
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenamingId(null)}
            onSetDefault={() => onSetDefault(page.id)}
            onDelete={() => onRemovePage(page.id)}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          disabled={!canAdd}
          onClick={() => onAddPage()}
        >
          <Plus className="size-4" />
          {t('dashboard.builder.page.add')}
        </Button>
      </div>
    </SortableContext>
  )
}
