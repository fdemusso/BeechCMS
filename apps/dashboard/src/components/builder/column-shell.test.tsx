// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * The drop marker and the column's outline while an item is dragged. The marker takes no room of its own (its
 * negative margins cancel the gaps around it), which is CSS and is checked in the browser, not here.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuilderDragContext, type BuilderDragState } from './layout-dnd'
import { ColumnShell } from './column-shell'

const COLUMN = { rootId: 'r1', sectionId: 's1', columnId: 'c1' }

function renderColumn(dragState: BuilderDragState) {
  return render(
    <BuilderDragContext.Provider value={dragState}>
      <ColumnShell
        column={COLUMN}
        dragId="column:r1:s1:c1"
        zoneId="zone:r1:s1:c1"
        itemCount={2}
        reorderable={false}
        dragLabel="Drag the column"
        gap={0.5}
        footer={<span data-testid="footer" />}
      >
        <span data-testid="first" />
        <span data-testid="second" />
      </ColumnShell>
    </BuilderDragContext.Provider>,
  )
}

/** The zone's children, in order, as `first`, `second`, `footer` or `marker`. */
const zoneOrder = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[class*="flex-1"] > *')).map((node) =>
    node.getAttribute('data-testid') ?? (node.getAttribute('aria-hidden') === 'true' ? 'marker' : 'other'),
  )

describe('ColumnShell', () => {
  it('draws the drop marker between the items at the index the drag is aiming for', () => {
    const { container } = renderColumn({ draggingItem: true, activeColumnKey: 'r1:s1:c1', dropIndex: 1 })

    expect(zoneOrder(container)).toEqual(['first', 'marker', 'second', 'footer'])
  })

  it('draws no marker in a column the dragged item would not land in', () => {
    const { container } = renderColumn({ draggingItem: true, activeColumnKey: 'r1:s2:c9', dropIndex: 1 })

    expect(zoneOrder(container)).toEqual(['first', 'second', 'footer'])
  })

  it('draws no marker when nothing is dragged', () => {
    const { container } = renderColumn({ draggingItem: false, activeColumnKey: null, dropIndex: null })

    expect(zoneOrder(container)).toEqual(['first', 'second', 'footer'])
  })
})
