// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Branch, FormLayout } from '@beechcms/core'
import {
  createCollisionDetection,
  makeAccepts,
  makeDragIds,
  type ColumnRef,
  type ItemLocation,
} from '@/components/builder/layout-dnd'
import { useLayoutDnd, type LayoutDndAdapter } from '@/components/builder/use-layout-dnd'
import { getFullWidthWarningLabel, type UseLayoutBuilderResult } from './use-layout-builder'

export type DragKind = 'tab' | 'section' | 'column' | 'field'

const ids = makeDragIds('tab', 'field')

/** Drag ids; see `makeDragIds`. A field's id is its branch id alone, so it survives a change of column. */
export const dragIds = {
  tab: ids.root,
  section: ids.section,
  column: ids.column,
  field: ids.item,
  zone: ids.zone,
}

/** The shared drag logic, set up for tabs, sections, columns and fields. */
export const builderCollisionDetection = createCollisionDetection(makeAccepts('tab', 'field'), 'field')

const findSection = (layout: FormLayout, rootId: string, sectionId: string) =>
  layout.tabs.find((tab) => tab.id === rootId)?.sections.find((section) => section.id === sectionId)

const findColumn = (layout: FormLayout, { rootId, sectionId, columnId }: ColumnRef) =>
  findSection(layout, rootId, sectionId)?.columns.find((column) => column.id === columnId)

export function locateField(layout: FormLayout, branchId: string): ItemLocation | null {
  for (const tab of layout.tabs) {
    for (const section of tab.sections) {
      for (const column of section.columns) {
        const index = column.fields.findIndex((field) => field.branchId === branchId)
        if (index !== -1) {
          return { rootId: tab.id, sectionId: section.id, columnId: column.id, index, count: column.fields.length }
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
  /** The dragged field, for `kind: 'field'`. */
  readonly branch?: Branch
  /** The fields of the dragged column, in order, for `kind: 'column'`. */
  readonly fields?: readonly Branch[]
  /** The dragged section's columns, each with its fields in order, for `kind: 'section'`. */
  readonly columns?: readonly (readonly Branch[])[]
}

interface UseBuilderDndArgs {
  readonly ops: UseLayoutBuilderResult
  readonly branchById: Record<string, Branch>
}

/**
 * Drag and drop for the entry layout builder: the shared layout drag (`useLayoutDnd`) told how a form layout is
 * shaped. Nothing moves while dragging; the move is made at the drop. A move the layout rules refuse (a full-width
 * field needs a section of its own) leaves the field where it was and says why, once, at the drop. Reordering
 * tabs does not change which one is open.
 */
export function useBuilderDnd({ ops, branchById }: UseBuilderDndArgs) {
  const { t } = useTranslation()
  const { draft } = ops

  const adapter = React.useMemo<LayoutDndAdapter<FormLayout, DragPreviewInfo>>(() => {
    const branchesOf = (fields: readonly { readonly branchId: string }[]) =>
      fields.flatMap((field) => branchById[field.branchId] ?? [])

    return {
      rootKind: 'tab',
      itemKind: 'field',
      draft,
      locateItem: locateField,
      columnItemCount: (layout, column) => findColumn(layout, column)?.fields.length ?? 0,
      sectionIds: (layout, rootId) => layout.tabs.find((tab) => tab.id === rootId)?.sections.map((s) => s.id),
      columnIds: (layout, rootId, sectionId) => findSection(layout, rootId, sectionId)?.columns.map((c) => c.id),
      rootIds: (layout) => layout.tabs.map((tab) => tab.id),
      buildPreview: (layout, id, width) => {
        const [kind, a, b, c] = id.split(':') as [DragKind, string, string, string]
        if (kind === 'field') {
          const branch = branchById[a]
          return { kind, width, label: branch?.label ?? '', branch }
        }
        if (kind === 'section') {
          const section = findSection(layout, a, b)
          return { kind, width, label: section?.label ?? '', columns: (section?.columns ?? []).map((column) => branchesOf(column.fields)) }
        }
        if (kind === 'tab') {
          return { kind, width, label: layout.tabs.find((tab) => tab.id === a)?.label ?? '' }
        }
        return { kind, width, label: '', fields: branchesOf(findColumn(layout, { rootId: a, sectionId: b, columnId: c })?.fields ?? []) }
      },
      moveItem: ({ from, to }) =>
        ops.moveField({
          from: { tabId: from.rootId, sectionId: from.sectionId, columnId: from.columnId, branchId: from.itemId },
          to: { tabId: to.rootId, sectionId: to.sectionId, columnId: to.columnId, index: to.index },
        }),
      reorderItems: (column, fromIndex, toIndex) =>
        ops.reorderFieldsInColumn(column.rootId, column.sectionId, column.columnId, fromIndex, toIndex),
      reorderSections: ops.reorderSections,
      reorderColumns: ops.reorderColumns,
      reorderRoots: ops.reorderTabs,
      rejectionMessage: (layout, itemId, to) => {
        const branch = branchById[itemId]
        const label = branch ? getFullWidthWarningLabel(branch, findSection(layout, to.rootId, to.sectionId), branchById) : ''
        return t('layoutBuilder.warnFullWidth', { label })
      },
      crossRootSectionMessage: t('layoutBuilder.warnNoCrossTabSection'),
      notify: (message) => { toast.warning(message) },
    }
  }, [draft, ops, branchById, t])

  return useLayoutDnd(adapter)
}
