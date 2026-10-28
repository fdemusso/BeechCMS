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
  type DroppableContainer,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Branch, FormLayout } from '@beechcms/core'
import { getFullWidthWarningLabel, type UseLayoutBuilderResult } from './use-layout-builder'

export type DragKind = 'tab' | 'section' | 'column' | 'field'

/**
 * Drag ids. A field's id is its branch id alone: it must survive the field changing column mid-drag, which
 * a container-qualified id would not. Where a field sits is read from the draft, and carried on the
 * sortable's `data` (`type`, `tabId`, `sectionId`, `columnId`) for the collision logic.
 */
export const dragIds = {
  tab: (tabId: string) => `tab:${tabId}`,
  section: (tabId: string, sectionId: string) => `section:${tabId}:${sectionId}`,
  column: (tabId: string, sectionId: string, columnId: string) => `column:${tabId}:${sectionId}:${columnId}`,
  field: (branchId: string) => `field:${branchId}`,
  zone: (tabId: string, sectionId: string, columnId: string) => `zone:${tabId}:${sectionId}:${columnId}`,
}

/** Ids are `kind:...` with UUID parts, so a colon never appears inside a part. */
function kindOf(id: string): DragKind {
  return id.split(':')[0] as DragKind
}

/** Which droppables each kind of drag may land on. */
const ACCEPTS: Record<DragKind, readonly string[]> = {
  field: ['field', 'zone'],
  section: ['section'],
  column: ['column'],
  tab: ['tab'],
}

/**
 * The droppables a kind of drag may land on, per kind, cached on the list dnd-kit hands over. That list
 * is rebuilt only when droppables mount, unmount or toggle — not on pointer moves — so keying a WeakMap
 * by it means the filtering runs once per kind instead of on every move, and a stale entry can never
 * outlive its list.
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
 * The droppable under the pointer, restricted to what the drag can land on, so a field never "collides"
 * with a section or a tab. A field under the pointer wins over the column zone that surrounds it;
 * without a pointer (keyboard) or a hit, the nearest accepted droppable decides.
 */
export const builderCollisionDetection: CollisionDetection = (args) => {
  const droppableContainers = acceptedContainers(args.droppableContainers, kindOf(String(args.active.id)))
  const scoped = { ...args, droppableContainers }

  const hits = pointerWithin(scoped)
  if (hits.length > 0) {
    const isField = (hit: Collision) =>
      droppableContainers.find((container) => container.id === hit.id)?.data.current?.type === 'field'
    return [hits.find(isField) ?? hits[0]]
  }
  return closestCenter(scoped)
}

interface FieldLocation {
  tabId: string
  sectionId: string
  columnId: string
  index: number
  count: number
}

function locateField(layout: FormLayout, branchId: string): FieldLocation | null {
  for (const tab of layout.tabs) {
    for (const section of tab.sections) {
      for (const column of section.columns) {
        const index = column.fields.findIndex((field) => field.branchId === branchId)
        if (index !== -1) {
          return { tabId: tab.id, sectionId: section.id, columnId: column.id, index, count: column.fields.length }
        }
      }
    }
  }
  return null
}

const sameColumn = (a: { tabId: string; sectionId: string; columnId: string }, b: typeof a) =>
  a.tabId === b.tabId && a.sectionId === b.sectionId && a.columnId === b.columnId

/** What the drag overlay draws for the item in flight. */
export interface DragPreviewInfo {
  readonly kind: DragKind
  /** Width of the dragged element, so the overlay matches what the user grabbed. */
  readonly width: number
  readonly label: string
  /** The dragged field, for `kind: 'field'`. */
  readonly branch?: Branch
  /** The fields of the dragged column, in order, for `kind: 'column'`. */
  readonly fields?: readonly Branch[]
  /** The dragged section's columns, each with its fields in order, for `kind: 'section'`. */
  readonly columns?: readonly (readonly Branch[])[]
}

export interface BuilderDragState {
  /** True while a field is in flight: columns show where it can go. */
  readonly draggingField: boolean
  /** The column the dragged field currently sits in (tab:section:column), if any. */
  readonly activeColumnKey: string | null
}

export const BuilderDragContext = React.createContext<BuilderDragState>({ draggingField: false, activeColumnKey: null })

interface UseBuilderDndArgs {
  readonly ops: UseLayoutBuilderResult
  readonly branchById: Record<string, Branch>
}

/**
 * Drag and drop for the layout builder.
 *
 * Fields move between columns, sections' columns and back *while* the pointer moves (the draft is updated
 * on drag-over, with the insertion index taken from the pointer), so the target opens a gap and the
 * result is what you see; same-column reordering is finished on drop. `Esc` restores the layout as it
 * was when the drag began. A drop the layout rules refuse leaves the field where it was and says why.
 */
export function useBuilderDnd({ ops, branchById }: UseBuilderDndArgs) {
  const { t } = useTranslation()
  const { draft } = ops
  const [preview, setPreview] = React.useState<DragPreviewInfo | null>(null)
  const snapshotRef = React.useRef<FormLayout | null>(null)
  const rejectedRef = React.useRef<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const dragState = React.useMemo<BuilderDragState>(() => {
    if (preview?.kind !== 'field' || !preview.branch) return { draggingField: false, activeColumnKey: null }
    const where = locateField(draft, preview.branch.id)
    return {
      draggingField: true,
      activeColumnKey: where ? `${where.tabId}:${where.sectionId}:${where.columnId}` : null,
    }
  }, [preview, draft])

  const onDragStart = React.useCallback(
    ({ active }: DragStartEvent) => {
      const id = String(active.id)
      const kind = kindOf(id)
      snapshotRef.current = structuredClone(draft)
      rejectedRef.current = null

      const width = active.rect.current.initial?.width ?? 0
      if (kind === 'field') {
        const branch = branchById[id.split(':')[1]]
        setPreview({ kind, width, label: branch?.label ?? '', branch })
      } else if (kind === 'section') {
        const [, tabId, sectionId] = id.split(':')
        const section = draft.tabs.find((tab) => tab.id === tabId)?.sections.find((s) => s.id === sectionId)
        const columns = (section?.columns ?? []).map((column) =>
          column.fields.flatMap((field) => branchById[field.branchId] ?? []),
        )
        setPreview({ kind, width, label: section?.label ?? '', columns })
      } else if (kind === 'tab') {
        setPreview({ kind, width, label: draft.tabs.find((tab) => `tab:${tab.id}` === id)?.label ?? '' })
      } else {
        const [, tabId, sectionId, columnId] = id.split(':')
        const column = draft.tabs
          .find((tab) => tab.id === tabId)?.sections.find((s) => s.id === sectionId)
          ?.columns.find((c) => c.id === columnId)
        const fields = (column?.fields ?? []).flatMap((field) => branchById[field.branchId] ?? [])
        setPreview({ kind, width, label: '', fields })
      }
    },
    [draft, branchById, t],
  )

  const onDragOver = React.useCallback(
    ({ active, over }: DragOverEvent) => {
      if (!over || kindOf(String(active.id)) !== 'field') return
      const branchId = String(active.id).split(':')[1]
      const from = locateField(draft, branchId)
      if (!from) return

      const overData = over.data.current
      let target: { tabId: string; sectionId: string; columnId: string; index: number } | null = null
      if (overData?.type === 'zone') {
        const zone = overData as { tabId: string; sectionId: string; columnId: string }
        const count = draft.tabs
          .find((tab) => tab.id === zone.tabId)?.sections.find((s) => s.id === zone.sectionId)
          ?.columns.find((c) => c.id === zone.columnId)?.fields.length ?? 0
        target = { ...zone, index: count }
      } else if (overData?.type === 'field') {
        const overLocation = locateField(draft, String(over.id).split(':')[1])
        if (!overLocation) return
        // Dropping on the lower half of a field lands after it, on the upper half before it.
        const dragged = active.rect.current.translated
        const below = dragged ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2 : false
        target = { ...overLocation, index: overLocation.index + (below ? 1 : 0) }
      }
      if (!target) return

      // Same column: sortable already animates it, and the drop finishes the reorder.
      if (sameColumn(from, target)) {
        rejectedRef.current = null
        return
      }

      const moved = ops.moveField({ from: { ...from, branchId }, to: target })
      if (moved) {
        rejectedRef.current = null
        return
      }
      const branch = branchById[branchId]
      const targetSection = draft.tabs.find((tab) => tab.id === target.tabId)?.sections.find((s) => s.id === target.sectionId)
      rejectedRef.current = branch ? getFullWidthWarningLabel(branch, targetSection, branchById) : ''
    },
    [draft, ops, branchById],
  )

  const finishField = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      const from = locateField(draft, String(active.id).split(':')[1])
      if (over && from) {
        const overData = over.data.current
        if (overData?.type === 'field') {
          const to = locateField(draft, String(over.id).split(':')[1])
          if (to && sameColumn(from, to) && from.index !== to.index) {
            ops.reorderFieldsInColumn(from.tabId, from.sectionId, from.columnId, from.index, to.index)
          }
        } else if (overData?.type === 'zone') {
          const zone = overData as { tabId: string; sectionId: string; columnId: string }
          if (sameColumn(from, zone) && from.index !== from.count - 1) {
            ops.reorderFieldsInColumn(from.tabId, from.sectionId, from.columnId, from.index, from.count - 1)
          }
        }
      }
      if (rejectedRef.current !== null) {
        toast.warning(t('layoutBuilder.warnFullWidth', { label: rejectedRef.current }))
      }
    },
    [draft, ops, t],
  )

  const finishSection = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return
      const [, aTabId, aSectionId] = String(active.id).split(':')
      const [, oTabId, oSectionId] = String(over.id).split(':')
      if (aTabId !== oTabId) {
        toast.warning(t('layoutBuilder.warnNoCrossTabSection'))
        return
      }
      const tab = draft.tabs.find((candidate) => candidate.id === aTabId)
      if (!tab) return
      const fromIndex = tab.sections.findIndex((s) => s.id === aSectionId)
      const toIndex = tab.sections.findIndex((s) => s.id === oSectionId)
      if (fromIndex !== -1 && toIndex !== -1) ops.reorderSections(aTabId, fromIndex, toIndex)
    },
    [draft, ops, t],
  )

  const finishColumn = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return
      const [, aTabId, aSectionId, aColId] = String(active.id).split(':')
      const [, oTabId, oSectionId, oColId] = String(over.id).split(':')
      if (aTabId !== oTabId || aSectionId !== oSectionId) return
      const section = draft.tabs.find((tab) => tab.id === aTabId)?.sections.find((s) => s.id === aSectionId)
      if (!section) return
      const fromIndex = section.columns.findIndex((c) => c.id === aColId)
      const toIndex = section.columns.findIndex((c) => c.id === oColId)
      if (fromIndex !== -1 && toIndex !== -1) ops.reorderColumns(aTabId, aSectionId, fromIndex, toIndex)
    },
    [draft, ops],
  )

  const finishTab = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return
      const fromIndex = draft.tabs.findIndex((tab) => `tab:${tab.id}` === String(active.id))
      const toIndex = draft.tabs.findIndex((tab) => `tab:${tab.id}` === String(over.id))
      // The active tab is left alone: reordering tabs must not also switch which one is open.
      if (fromIndex !== -1 && toIndex !== -1) ops.reorderTabs(fromIndex, toIndex)
    },
    [draft, ops],
  )

  const onDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setPreview(null)
      const kind = kindOf(String(event.active.id))
      if (kind === 'field') finishField(event)
      else if (kind === 'section') finishSection(event)
      else if (kind === 'column') finishColumn(event)
      else if (kind === 'tab') finishTab(event)
      snapshotRef.current = null
      rejectedRef.current = null
    },
    [finishField, finishSection, finishColumn, finishTab],
  )

  const onDragCancel = React.useCallback(() => {
    setPreview(null)
    if (snapshotRef.current) ops.restoreDraft(snapshotRef.current)
    snapshotRef.current = null
    rejectedRef.current = null
  }, [ops])

  return { sensors, preview, dragState, onDragStart, onDragOver, onDragEnd, onDragCancel }
}

