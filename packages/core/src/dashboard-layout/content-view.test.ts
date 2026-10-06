// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { defineSeed } from '../engine/seeds/define-seed.js'
import { AUTHORIZABLE_VIEWS } from './view-authorization.js'
import {
  VIEW_TYPE_IDS,
  contentViewConfigSchema,
  viewTitleSchema,
  updateContentViewInputSchema,
  validateViewConfigAgainstSeed,
  projectContentViews,
  mergeContentViewOrder,
  type ContentViewConfig,
  type ContentViewRecord,
} from './content-view.js'

// @beechcms/testing depends on @beechcms/core, so core suites cannot import the canonical
// seeds; this seed carries exactly the branch types the cleanup rules distinguish.
const ARTICLES = defineSeed({
  slug: 'articles',
  label: 'Article',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'published_on', label: 'Published on', type: 'date' },
    { id: 'br_03', alias: 'stage', label: 'Stage', type: 'text', options: ['todo', 'done'] },
    { id: 'br_04', alias: 'summary', label: 'Summary', type: 'richtext' },
  ],
  dashboard: { views: ['table', 'gallery'] },
})

function emptyConfig(): ContentViewConfig {
  return contentViewConfigSchema.parse({})
}

describe('VIEW_TYPE_IDS', () => {
  it('lists exactly the authorizable views in canonical order', () => {
    expect([...VIEW_TYPE_IDS]).toEqual([...AUTHORIZABLE_VIEWS])
  })
})

describe('contentViewConfigSchema', () => {
  it('parses an empty object into a complete default config', () => {
    const result = contentViewConfigSchema.parse({})

    expect(result).toEqual({ filters: [], sort: null, groupBy: null, appearance: {}, conditionalFormats: [] })
  })

  // Regression guard: persisted configs must survive branch renames (Botanical invariant).
  it('rejects a column reference written as an alias', () => {
    const result = contentViewConfigSchema.safeParse({
      filters: [{ columnRef: 'title', conditions: [{ op: 'eq', value: 'x' }] }],
    })

    expect(result.success).toBe(false)
  })

  it('rejects a filter with more conditions than the toolbar allows', () => {
    const result = contentViewConfigSchema.safeParse({
      filters: [{
        columnRef: 'br_01',
        conditions: [
          { op: 'eq', value: '1' },
          { op: 'eq', value: '2' },
          { op: 'eq', value: '3' },
          { op: 'eq', value: '4' },
        ],
      }],
    })

    expect(result.success).toBe(false)
  })

  it('rejects a conditional format whose target is the legacy row value', () => {
    const result = contentViewConfigSchema.safeParse({
      conditionalFormats: [{
        id: 'f1',
        enabled: true,
        priority: 0,
        columnRef: 'br_01',
        conditions: [{ op: 'eq', value: 'x' }],
        tone: 'neutral',
        target: 'row',
      }],
    })

    expect(result.success).toBe(false)
  })
})

describe('viewTitleSchema', () => {
  it.each([
    ['  Covers ', 'Covers'],
    ['   ', null],
    [null, null],
  ])('trims the title and collapses a whitespace-only title to null (%j → %j)', (input, expected) => {
    expect(viewTitleSchema.parse(input)).toBe(expected)
  })

  it('rejects a title longer than 60 characters', () => {
    const result = viewTitleSchema.safeParse('x'.repeat(61))

    expect(result.success).toBe(false)
  })
})

describe('updateContentViewInputSchema', () => {
  it('rejects a body that carries neither title nor config', () => {
    const result = updateContentViewInputSchema.safeParse({})

    expect(result.success).toBe(false)
  })
})

describe('validateViewConfigAgainstSeed', () => {
  it('drops every reference to a branch the seed does not have', () => {
    const config: ContentViewConfig = {
      filters: [
        { columnRef: 'br_99', conditions: [{ op: 'eq', value: 'x' }] },
        { columnRef: 'br_01', conditions: [{ op: 'eq', value: 'x' }] },
      ],
      sort: { columnRef: 'br_99', desc: false },
      groupBy: { columnRef: 'br_99' },
      appearance: { hiddenColumns: ['br_99', 'br_01'] },
      conditionalFormats: [
        { id: 'f1', enabled: true, priority: 0, columnRef: 'br_99', conditions: [{ op: 'eq', value: 'x' }], tone: 'neutral', target: 'element', textStyles: [] },
      ],
    }

    const result = validateViewConfigAgainstSeed(config, ARTICLES, 'table')

    expect(result.filters).toEqual([{ columnRef: 'br_01', conditions: [{ op: 'eq', value: 'x' }] }])
    expect(result.sort).toBeNull()
    expect(result.groupBy).toBeNull()
    expect(result.appearance.hiddenColumns).toEqual(['br_01'])
    expect(result.conditionalFormats).toEqual([])
  })

  it('keeps only the first filter on a repeated column', () => {
    const config: ContentViewConfig = {
      ...emptyConfig(),
      filters: [
        { columnRef: 'br_01', conditions: [{ op: 'eq', value: 'a' }] },
        { columnRef: 'br_01', conditions: [{ op: 'eq', value: 'b' }] },
      ],
    }

    const result = validateViewConfigAgainstSeed(config, ARTICLES, 'table')

    expect(result.filters).toEqual([{ columnRef: 'br_01', conditions: [{ op: 'eq', value: 'a' }] }])
  })

  it('drops date precision when grouping by a non-date column', () => {
    const config: ContentViewConfig = {
      ...emptyConfig(),
      groupBy: { columnRef: 'br_03', datePrecision: { year: true, month: false, day: false } },
    }

    const result = validateViewConfigAgainstSeed(config, ARTICLES, 'table')

    expect(result.groupBy).toEqual({ columnRef: 'br_03' })
  })

  it('keeps date precision when grouping by a date column', () => {
    const config: ContentViewConfig = {
      ...emptyConfig(),
      groupBy: { columnRef: 'br_02', datePrecision: { year: true, month: false, day: false } },
    }

    const result = validateViewConfigAgainstSeed(config, ARTICLES, 'table')

    expect(result.groupBy).toEqual({ columnRef: 'br_02', datePrecision: { year: true, month: false, day: false } })
  })

  it('omits the kanban and card sub-config on a non-kanban instance', () => {
    const config: ContentViewConfig = {
      ...emptyConfig(),
      kanban: { axisBranchId: 'br_03', sort: null },
      card: { version: 1, media: null, header: null, subtitle: null, metadata: [] },
    }

    const result = validateViewConfigAgainstSeed(config, ARTICLES, 'table')

    expect(result.kanban).toBeUndefined()
    expect(result.card).toBeUndefined()
  })

  it('keeps the card layout but omits the kanban sub-config on a gallery instance', () => {
    const config: ContentViewConfig = {
      ...emptyConfig(),
      kanban: { axisBranchId: 'br_03', sort: null },
      card: { version: 1, media: null, header: null, subtitle: null, metadata: [] },
    }

    const result = validateViewConfigAgainstSeed(config, ARTICLES, 'gallery')

    expect(result.kanban).toBeUndefined()
    expect(result.card).toEqual({ version: 1, media: null, header: null, subtitle: null, metadata: [] })
  })

  it('resets a kanban axis that is not an axis candidate', () => {
    const config: ContentViewConfig = {
      ...emptyConfig(),
      kanban: { axisBranchId: 'br_01', sort: null },
    }

    const result = validateViewConfigAgainstSeed(config, ARTICLES, 'kanban')

    expect(result.kanban?.axisBranchId).toBeNull()
  })

  it('keeps a kanban axis that is an axis candidate', () => {
    const config: ContentViewConfig = {
      ...emptyConfig(),
      kanban: { axisBranchId: 'br_03', sort: null },
    }

    const result = validateViewConfigAgainstSeed(config, ARTICLES, 'kanban')

    expect(result.kanban?.axisBranchId).toBe('br_03')
  })
})

describe('projectContentViews', () => {
  it('omits records whose type the seed does not authorize and keeps the order of the rest', () => {
    const records: ContentViewRecord[] = [
      { id: 'table', seedSlug: 'articles', type: 'table', title: null, position: 0, config: emptyConfig(), createdAt: 1, updatedAt: 1, updatedBy: 'u1' },
      { id: 'kanban', seedSlug: 'articles', type: 'kanban', title: null, position: 1, config: emptyConfig(), createdAt: 1, updatedAt: 1, updatedBy: 'u1' },
      { id: 'gallery', seedSlug: 'articles', type: 'gallery', title: null, position: 2, config: emptyConfig(), createdAt: 1, updatedAt: 1, updatedBy: 'u1' },
    ]

    const result = projectContentViews(records, ARTICLES)

    expect(result.map((view) => view.id)).toEqual(['table', 'gallery'])
  })
})

describe('mergeContentViewOrder', () => {
  it('refills the visible slots in the requested order and keeps a hidden id in its slot', () => {
    const result = mergeContentViewOrder(['t', 'g1', 'k', 'g2'], ['g2', 'g1', 't'])

    expect(result).toEqual(['g2', 'g1', 'k', 't'])
  })

  it('returns the requested order when every row is visible', () => {
    const result = mergeContentViewOrder(['t', 'g1', 'g2'], ['g2', 't', 'g1'])

    expect(result).toEqual(['g2', 't', 'g1'])
  })

  it('returns a permutation of every input id with no duplicates', () => {
    const allIds = ['t', 'g1', 'k', 'g2']

    const result = mergeContentViewOrder(allIds, ['g2', 'g1', 't'])

    expect([...result].sort()).toEqual([...allIds].sort())
  })
})
