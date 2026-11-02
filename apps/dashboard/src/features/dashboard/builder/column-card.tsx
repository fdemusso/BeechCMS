// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Plus } from '@/components/icons'
import type { DashboardColumn, DashboardPageLayout, EffectivePermissions } from '@beechcms/core'
import { ColumnShell } from '@/components/builder/column-shell'
import { Button } from '@/components/ui/button'
import { WidgetBlock, type ConfigureTarget } from './widget-block'
import { WidgetPickerMenu } from './widget-picker-menu'
import { dragIds } from './use-dashboard-dnd'
import type { DashboardBuilderActions } from './use-dashboard-builder'

const notify = (message: string) => { toast.warning(message) }

export interface ColumnCardProps {
  readonly pageId: string
  readonly sectionId: string
  readonly column: DashboardColumn
  /** Width on the 12-unit grid. */
  readonly span: number
  readonly otherPages: readonly DashboardPageLayout[]
  readonly ops: DashboardBuilderActions
  readonly permissions: EffectivePermissions
  readonly onConfigureWidget: (target: ConfigureTarget) => void
  /** Whether the column can be dragged to swap places: false when it is its section's only column. */
  readonly reorderable: boolean
}

/**
 * A dashboard column: the shared column frame, holding widget ghosts and the Add widget button. Memoised: its
 * props keep their identity while other columns are edited or dragged into.
 */
export const ColumnCard = React.memo(function ColumnCard({
  pageId,
  sectionId,
  column,
  span,
  otherPages,
  ops,
  permissions,
  onConfigureWidget,
  reorderable,
}: Readonly<ColumnCardProps>) {
  const { t } = useTranslation()
  const columnId = column.id

  return (
    <ColumnShell
      column={{ rootId: pageId, sectionId, columnId }}
      dragId={dragIds.column(pageId, sectionId, columnId)}
      zoneId={dragIds.zone(pageId, sectionId, columnId)}
      itemCount={column.widgets.length}
      reorderable={reorderable}
      dragLabel={t('dashboard.builder.column.drag')}
      handleClassName="-top-3 rounded-control border bg-background px-3 py-0.5 text-muted-foreground hover:bg-muted"
      handleIconClassName="size-6 rotate-90"
      gap={3}
      // Same corner radius as the widget cards it outlines while a drag is on.
      className="rounded-2xl"
      style={{ gridColumn: `span ${span} / span ${span}` }}
      footer={
        <WidgetPickerMenu
          permissions={permissions}
          onSelect={(type) => {
            if (!ops.addWidget(pageId, sectionId, columnId, type)) toast.warning(t('dashboard.builder.warnColumnFull'))
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-center text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          >
            <Plus className="mr-1 size-3" />
            {t('dashboard.builder.widget.add')}
          </Button>
        </WidgetPickerMenu>
      }
    >
      {column.widgets.map((widget) => (
        <WidgetBlock
          key={widget.id}
          pageId={pageId}
          sectionId={sectionId}
          columnId={columnId}
          widget={widget}
          span={span}
          otherPages={otherPages}
          ops={ops}
          permissions={permissions}
          onConfigure={onConfigureWidget}
          onNotice={notify}
        />
      ))}
    </ColumnShell>
  )
})
