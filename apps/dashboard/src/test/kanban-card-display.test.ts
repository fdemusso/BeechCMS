// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { buildKanbanCardDisplayModel } from '@/features/content-kanban/utils/kanban-card-display'
import type { Branch } from '@beechcms/core'

const axisBranch = { id: 'br_01', alias: 'status', type: 'text', label: 'Status' } as Branch

const baseSeed = {
  slug: 'tasks',
  label: 'Tasks',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'status', type: 'text', label: 'Status' },
    { id: 'br_02', alias: 'title', type: 'text', label: 'Title' },
    { id: 'br_03', alias: 'due', type: 'date', label: 'Due date' },
  ],
} as any

const baseEntry = {
  id: 'entry-1',
  status: 'published',
  data: { title: 'Task one', status: 'open', due: '2026-01-01' },
} as any

describe('buildKanbanCardDisplayModel — legacy heuristic (no card config)', () => {
  it('sets entryId from entry.id', () => {
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open')
    expect(model.entryId).toBe('entry-1')
  })

  it('resolves title from first non-system string field', () => {
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open')
    expect(model.title).toBe('Task one')
  })

  it('sets axisValue from columnValue', () => {
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'done')
    expect(model.axisValue).toBe('done')
  })

  it('omits statusBadge when status is published', () => {
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open')
    expect(model.statusBadge).toBeUndefined()
  })

  it('sets statusBadge when status is not published', () => {
    const draft = { ...baseEntry, status: 'draft' }
    const model = buildKanbanCardDisplayModel(draft, axisBranch, 'open')
    expect(model.statusBadge).toBe('draft')
  })

  it('slots is undefined when no card config passed', () => {
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open')
    expect(model.slots).toBeUndefined()
  })

  it('falls back to entryId as title when no string fields', () => {
    const entry = { id: 'entry-2', status: 'published', data: { count: 5 } } as any
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.title).toBe('entry-2')
  })
})

describe('buildKanbanCardDisplayModel — slot resolution (with card config)', () => {
  const cardConfig = {
    version: 1 as const,
    header: { branchId: 'br_02' },
    subtitle: { branchId: 'br_03' },
    metadata: [],
  }

  it('resolves header slot from card config', () => {
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open', baseSeed, cardConfig)
    expect(model.slots?.header?.branch.alias).toBe('title')
    expect(model.slots?.header?.value).toBe('Task one')
  })

  it('resolves subtitle slot from card config', () => {
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open', baseSeed, cardConfig)
    expect(model.slots?.subtitle?.branch.alias).toBe('due')
    expect(model.slots?.subtitle?.value).toBe('2026-01-01')
  })

  it('metadata is empty array when config.metadata is empty', () => {
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open', baseSeed, cardConfig)
    expect(model.slots?.metadata).toEqual([])
  })

  it('returns undefined slot when branchId is missing from seed', () => {
    const badCard = { version: 1 as const, header: { branchId: 'br_99' }, metadata: [] }
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open', baseSeed, badCard)
    expect(model.slots?.header).toBeUndefined()
  })

  it('resolves metadata slots', () => {
    const card = { version: 1 as const, metadata: [{ branchId: 'br_03' }] }
    const model = buildKanbanCardDisplayModel(baseEntry, axisBranch, 'open', baseSeed, card)
    expect(model.slots?.metadata).toHaveLength(1)
    expect(model.slots?.metadata[0]?.branch.alias).toBe('due')
  })
})
