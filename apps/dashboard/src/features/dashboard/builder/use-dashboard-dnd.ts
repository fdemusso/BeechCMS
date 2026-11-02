// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DroppableContainer,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { DashboardLayout, DashboardSection, DashboardWidgetInstance } from '@beechcms/core'
import type { UseDashboardBuilderResult } from './use-dashboard-builder'

export type DragKind = 'page' | 'section' | 'column' | 'widget'

/**
 * Drag ids. A widget's id is its own id alone: it must survive the widget changing column mid-drag, which a
 * container-qualified id would not. Where a widget sits is read from the draft (`locateWidget`) and carried on
 * the sortable's `data` (`type`, `pageId`, `sectionId`, `columnId`) for the collision logic.
 */
export const dragIds = {
  page: (pageId: string) => `page:${pageId}`,
  section: (pageId: string, sectionId: string) => `section:${pageId}:${sectionId}`,
  column: (pageId: string, sectionId: string, columnId: string) => `column:${pageId}:${sectionId}:${columnId}`,
  widget: (widgetId: string) => `widget:${widgetId}`,
  zone: (pageId: string, sectionId: string, columnId: string) => `zone:${pageId}:${sectionId}:${columnId}`,
}

/** Ids are `kind:...` with UUID parts, so a colon never appears inside a part. */
export function kindOf(id: string): DragKind {
  return id.split(':')[0] as DragKind
}

/** Which droppables each kind of drag may land on. */
const ACCEPTS: Record<DragKind, readonly string[]> = {
  widget: ['widget', 'zone'],
  section: ['section'],
  column: ['column'],
  page: ['page'],
}

/**
 * The droppables a kind of drag may land on, per kind, cached on the list dnd-kit hands over. That list is
 * rebuilt only when droppables mount, unmount or toggle (not on pointer moves), so keying a WeakMap by it
 * means the filtering runs once per kind instead of on every move, and a stale entry cannot outlive its list.
 */
const acceptedByList = new WeakMap<object, Map<DragKind, DroppableContainer[]>>()

function acceptedContainers(all: DroppableContainer[], kind: DragKind): DroppableContainer[] {
  let byKind = acceptedByList.get(all)
  if (!byKind) {
    byKind = new Map()
    acceptedByList.set(all, byKind)
  }
  let accepted = byKind.get(kind)
  if (!accepted) {
    const types = ACCEPTS[kind]
    accepted = all.filter((container) => types.includes(String(container.data.current?.type)))
    byKind.set(kind, accepted)
  }
  return accepted
}

/**
 * The droppable under the pointer, restricted to what the drag can land on, so a widget never "collides" with
 * a section or a page. A widget under the pointer wins over the column zone that surrounds it; without a
 * pointer (keyboard) or a hit, the nearest accepted droppable decides.
 */
export const dashboardCollisionDetection: CollisionDetection = (args) => {
  const droppableContainers = acceptedContainers(args.droppableContainers, kindOf(String(args.active.id)))
  const scoped = { ...args, droppableContainers }

  const hits = pointerWithin(scoped)
  if (hits.length > 0) {
    const isWidget = (hit: Collision) =>
      droppableContainers.find((container) => container.id === hit.id)?.data.current?.type === 'widget'
    return [hits.find(isWidget) ?? hits[0]]
  }
  return closestCenter(scoped)
}

export interface WidgetLocation {
  pageId: string
  sectionId: string
  columnId: string
  index: number
  count: number
}

export function locateWidget(layout: DashboardLayout, widgetId: string): WidgetLocation | null {
  for (const page of layout.pages) {
    for (const section of page.sections) {
      for (const column of section.columns) {
        const index = column.widgets.findIndex((widget) => widget.id === widgetId)
        if (index !== -1) {
          return { pageId: page.id, sectionId: section.id, columnId: column.id, index, count: column.widgets.length }
        }
      }
    }
  }
  return null
}

const sameColumn = (a: { pageId: string; sectionId: string; columnId: string }, b: typeof a) =>
  a.pageId === b.pageId && a.sectionId === b.sectionId && a.columnId === b.columnId

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

export interface DashboardDragState {
  /** True while a widget is in flight: columns show where it can go. */
  readonly draggingWidget: boolean
  /** The column the dragged widget currently sits in (page:section:column), if any. */
  readonly activeColumnKey: string | null
}

export const DashboardDragContext = React.createContext<DashboardDragState>({ draggingWidget: false, activeColumnKey: null })

interface UseDashboardDndArgs {
  readonly ops: UseDashboardBuilderResult
}

/**
 * Drag and drop for the dashboard builder.
 *
 * Widgets move between columns and sections *while* the pointer moves (the draft is updated on drag-over,
 * with the insertion index taken from the pointer), so the target opens a gap and the result is what you see;
 * same-column reordering is finished on drop. `Esc` restores the layout as it was when the drag began. A drop
 * the rules refuse (a full column) leaves the widget where it was and says why, once, at the drop.
 */
export function useDashboardDnd({ ops }: UseDashboardDndArgs) {
  const { t } = useTranslation()
  const { draft } = ops
  const [preview, setPreview] = React.useState<DragPreviewInfo | null>(null)
  const snapshotRef = React.useRef<DashboardLayout | null>(null)
  const rejectedRef = React.useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const dragState = React.useMemo<DashboardDragState>(() => {
    if (preview?.kind !== 'widget' || !preview.widget) return { draggingWidget: false, activeColumnKey: null }
    const where = locateWidget(draft, preview.widget.id)
    return {
      draggingWidget: true,
      activeColumnKey: where ? `${where.pageId}:${where.sectionId}:${where.columnId}` : null,
    }
  }, [preview, draft])

  const onDragStart = React.useCallback(
    ({ active }: DragStartEvent) => {
      const id = String(active.id)
      const kind = kindOf(id)
      snapshotRef.current = structuredClone(draft)
      rejectedRef.current = false

      const width = active.rect.current.initial?.width ?? 0
      if (kind === 'widget') {
        const where = locateWidget(draft, id.split(':')[1])
        const widget = where
          ? draft.pages.find((p) => p.id === where.pageId)?.sections.find((s) => s.id === where.sectionId)
              ?.columns.find((c) => c.id === where.columnId)?.widgets[where.index]
          : undefined
        setPreview({ kind, width, label: widget?.title ?? '', widget })
      } else if (kind === 'section') {
        const [, pageId, sectionId] = id.split(':')
        const section = draft.pages.find((p) => p.id === pageId)?.sections.find((s) => s.id === sectionId)
        setPreview({ kind, width, label: section?.label ?? '', section })
      } else if (kind === 'page') {
        setPreview({ kind, width, label: draft.pages.find((p) => dragIds.page(p.id) === id)?.label ?? '' })
      } else {
        const [, pageId, sectionId, columnId] = id.split(':')
        const column = draft.pages
          .find((p) => p.id === pageId)?.sections.find((s) => s.id === sectionId)
          ?.columns.find((c) => c.id === columnId)
        setPreview({ kind, width, label: '', widgets: column?.widgets ?? [] })
      }
    },
    [draft],
  )

  const onDragOver = React.useCallback(
    ({ active, over }: DragOverEvent) => {
      if (!over || kindOf(String(active.id)) !== 'widget') return
      const widgetId = String(active.id).split(':')[1]
      const from = locateWidget(draft, widgetId)
      if (!from) return

      const overData = over.data.current
      let target: { pageId: string; sectionId: string; columnId: string; index: number } | null = null
      if (overData?.type === 'zone') {
        const zone = overData as { pageId: string; sectionId: string; columnId: string }
        const count = draft.pages
          .find((p) => p.id === zone.pageId)?.sections.find((s) => s.id === zone.sectionId)
          ?.columns.find((c) => c.id === zone.columnId)?.widgets.length ?? 0
        target = { ...zone, index: count }
      } else if (overData?.type === 'widget') {
        const overLocation = locateWidget(draft, String(over.id).split(':')[1])
        if (!overLocation) return
        // Dropping on the lower half of a widget lands after it, on the upper half before it.
        const dragged = active.rect.current.translated
        const below = dragged ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2 : false
        target = { ...overLocation, index: overLocation.index + (below ? 1 : 0) }
      }
      if (!target) return

      // Same column: sortable already animates it, and the drop finishes the reorder.
      if (sameColumn(from, target)) {
        rejectedRef.current = false
        return
      }

      const moved = ops.moveWidget({
        from: { ...from, widgetId },
        to: target,
      })
      rejectedRef.current = !moved
    },
    [draft, ops],
  )

  const finishWidget = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      const from = locateWidget(draft, String(active.id).split(':')[1])
      if (over && from) {
        const overData = over.data.current
        if (overData?.type === 'widget') {
          const to = locateWidget(draft, String(over.id).split(':')[1])
          if (to && sameColumn(from, to) && from.index !== to.index) {
            ops.reorderWidgetsInColumn(from.pageId, from.sectionId, from.columnId, from.index, to.index)
          }
        } else if (overData?.type === 'zone') {
          const zone = overData as { pageId: string; sectionId: string; columnId: string }
          if (sameColumn(from, zone) && from.index !== from.count - 1) {
            ops.reorderWidgetsInColumn(from.pageId, from.sectionId, from.columnId, from.index, from.count - 1)
          }
        }
      }
      if (rejectedRef.current) toast.warning(t('dashboard.builder.warnColumnFull'))
    },
    [draft, ops, t],
  )

  const finishSection = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return
      const [, aPageId, aSectionId] = String(active.id).split(':')
      const [, oPageId, oSectionId] = String(over.id).split(':')
      if (aPageId !== oPageId) {
        toast.warning(t('dashboard.builder.warnNoCrossPageSection'))
        return
      }
      const page = draft.pages.find((candidate) => candidate.id === aPageId)
      if (!page) return
      const fromIndex = page.sections.findIndex((s) => s.id === aSectionId)
      const toIndex = page.sections.findIndex((s) => s.id === oSectionId)
      if (fromIndex !== -1 && toIndex !== -1) ops.moveSection(aPageId, fromIndex, toIndex)
    },
    [draft, ops, t],
  )

  const finishColumn = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return
      const [, aPageId, aSectionId, aColId] = String(active.id).split(':')
      const [, oPageId, oSectionId, oColId] = String(over.id).split(':')
      if (aPageId !== oPageId || aSectionId !== oSectionId) return
      const section = draft.pages.find((p) => p.id === aPageId)?.sections.find((s) => s.id === aSectionId)
      if (!section) return
      const fromIndex = section.columns.findIndex((c) => c.id === aColId)
      const toIndex = section.columns.findIndex((c) => c.id === oColId)
      if (fromIndex !== -1 && toIndex !== -1) ops.moveColumn(aPageId, aSectionId, fromIndex, toIndex)
    },
    [draft, ops],
  )

  const finishPage = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return
      const fromIndex = draft.pages.findIndex((page) => dragIds.page(page.id) === String(active.id))
      const toIndex = draft.pages.findIndex((page) => dragIds.page(page.id) === String(over.id))
      // The open page is left alone: reordering pages must not also switch which one is open.
      if (fromIndex !== -1 && toIndex !== -1) ops.movePage(fromIndex, toIndex)
    },
    [draft, ops],
  )

  const onDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setPreview(null)
      const kind = kindOf(String(event.active.id))
      if (kind === 'widget') finishWidget(event)
      else if (kind === 'section') finishSection(event)
      else if (kind === 'column') finishColumn(event)
      else if (kind === 'page') finishPage(event)
      snapshotRef.current = null
      rejectedRef.current = false
    },
    [finishWidget, finishSection, finishColumn, finishPage],
  )

  const onDragCancel = React.useCallback(() => {
    setPreview(null)
    if (snapshotRef.current) ops.restoreDraft(snapshotRef.current)
    snapshotRef.current = null
    rejectedRef.current = false
  }, [ops])

  return { sensors, preview, dragState, onDragStart, onDragOver, onDragEnd, onDragCancel }
}
