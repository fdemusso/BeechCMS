// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { DashboardLayout, DashboardSection, DashboardWidgetInstance } from '@beechcms/core'
import {
  BuilderDragContext,
  createCollisionDetection,
  makeAccepts,
  makeDragIds,
  type ColumnRef,
  type ItemLocation,
} from '@/components/builder/layout-dnd'
import { useLayoutDnd, type LayoutDndAdapter } from '@/components/builder/use-layout-dnd'
import type { UseDashboardBuilderResult } from './use-dashboard-builder'

export type DragKind = 'page' | 'section' | 'column' | 'widget'

const ids = makeDragIds('page', 'widget')

/** Drag ids; see `makeDragIds`. A widget's id is its own id alone, so it survives a change of column mid-drag. */
export const dragIds = {
  page: ids.root,
  section: ids.section,
  column: ids.column,
  widget: ids.item,
  zone: ids.zone,
}

/** The shared drag logic, set up for pages, sections, columns and widgets. */
export const dashboardCollisionDetection = createCollisionDetection(makeAccepts('page', 'widget'), 'widget')

/** The context columns and sections read to outline themselves and to lock their height. */
export const DashboardDragContext = BuilderDragContext

const findColumn = (layout: DashboardLayout, { rootId, sectionId, columnId }: ColumnRef) =>
  layout.pages.find((p) => p.id === rootId)?.sections.find((s) => s.id === sectionId)?.columns.find((c) => c.id === columnId)

export function locateWidget(layout: DashboardLayout, widgetId: string): ItemLocation | null {
  for (const page of layout.pages) {
    for (const section of page.sections) {
      for (const column of section.columns) {
        const index = column.widgets.findIndex((widget) => widget.id === widgetId)
        if (index !== -1) {
          return { rootId: page.id, sectionId: section.id, columnId: column.id, index, count: column.widgets.length }
        }
      }
    }
  }
  return null
}

/** What the drag overlay draws for the item in flight. */
export interface DragPreviewInfo {
  readonly kind: DragKind
  /** Width of the dragged element, so the overlay matches what the user grabbed. */
  readonly width: number
  readonly label: string
  /** The dragged widget, for `kind: 'widget'`. */
  readonly widget?: DashboardWidgetInstance
  /** The dragged column's widgets, for `kind: 'column'`. */
  readonly widgets?: readonly DashboardWidgetInstance[]
  /** The dragged section, for `kind: 'section'`. */
  readonly section?: DashboardSection
}

function buildPreview(draft: DashboardLayout, id: string, width: number): DragPreviewInfo {
  const [kind, a, b, c] = id.split(':') as [DragKind, string, string, string]
  if (kind === 'widget') {
    const where = locateWidget(draft, a)
    const widget = where ? findColumn(draft, where)?.widgets[where.index] : undefined
    return { kind, width, label: widget?.title ?? '', widget }
  }
  if (kind === 'section') {
    const section = draft.pages.find((p) => p.id === a)?.sections.find((s) => s.id === b)
    return { kind, width, label: section?.label ?? '', section }
  }
  if (kind === 'page') {
    return { kind, width, label: draft.pages.find((p) => p.id === a)?.label ?? '' }
  }
  return { kind, width, label: '', widgets: findColumn(draft, { rootId: a, sectionId: b, columnId: c })?.widgets ?? [] }
}

interface UseDashboardDndArgs {
  readonly ops: UseDashboardBuilderResult
}

/**
 * Drag and drop for the dashboard builder: the shared layout drag (`useLayoutDnd`) told how this layout is
 * shaped. Nothing moves while dragging; the move is made at the drop. A full column (`MAX_WIDGETS_PER_COLUMN`)
 * refuses it: the widget stays and the drop says why.
 */
export function useDashboardDnd({ ops }: UseDashboardDndArgs) {
  const { t } = useTranslation()
  const { draft } = ops

  const adapter = React.useMemo<LayoutDndAdapter<DashboardLayout, DragPreviewInfo>>(
    () => ({
      rootKind: 'page',
      itemKind: 'widget',
      draft,
      locateItem: locateWidget,
      columnItemCount: (layout, column) => findColumn(layout, column)?.widgets.length ?? 0,
      sectionIds: (layout, rootId) => layout.pages.find((p) => p.id === rootId)?.sections.map((s) => s.id),
      columnIds: (layout, rootId, sectionId) =>
        layout.pages.find((p) => p.id === rootId)?.sections.find((s) => s.id === sectionId)?.columns.map((c) => c.id),
      rootIds: (layout) => layout.pages.map((p) => p.id),
      buildPreview,
      moveItem: ({ from, to }) =>
        ops.moveWidget({
          from: { pageId: from.rootId, sectionId: from.sectionId, columnId: from.columnId, widgetId: from.itemId },
          to: { pageId: to.rootId, sectionId: to.sectionId, columnId: to.columnId, index: to.index },
        }),
      reorderItems: (column, fromIndex, toIndex) =>
        ops.reorderWidgetsInColumn(column.rootId, column.sectionId, column.columnId, fromIndex, toIndex),
      reorderSections: ops.moveSection,
      reorderColumns: ops.moveColumn,
      reorderRoots: ops.movePage,
      rejectionMessage: () => t('dashboard.builder.warnColumnFull'),
      crossRootSectionMessage: t('dashboard.builder.warnNoCrossPageSection'),
      notify: (message) => { toast.warning(message) },
    }),
    [draft, ops, t],
  )

  return useLayoutDnd(adapter)
}
