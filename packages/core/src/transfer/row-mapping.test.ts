// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { defineSeed } from '../engine/define-seed.js'
import { exportColumns, fromCsvCells, toCsvCells, toImportPayload } from './row-mapping.js'

const MIXED_SEED = defineSeed({
  slug: 'articles',
  label: 'Article',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'category_id', label: 'Category', type: 'relation' },
    { id: 'br_03', alias: 'views', label: 'Views', type: 'number' },
  ],
})

describe('exportColumns', () => {
  it('puts the five system columns first, then scalar branch aliases, omitting non-flat ones', () => {
    const columns = exportColumns(MIXED_SEED)

    expect(columns).toEqual(['id', 'slug', 'status', 'created_at', 'updated_at', 'title', 'views'])
  })
})

describe('toCsvCells', () => {
  it('maps null, boolean, and number values to their CSV cell representation', () => {
    const cells = toCsvCells({ title: null, active: true, views: 42 }, ['title', 'active', 'views'])

    expect(cells).toEqual([null, 'true', '42'])
  })
})

describe('fromCsvCells', () => {
  it('rejects a row whose cell count does not match the column count', () => {
    const result = fromCsvCells(['title', 'views'], ['only-one'])

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.code).toBe('column_count_mismatch')
  })

  it('leaves the key absent from the record for an empty cell', () => {
    const result = fromCsvCells(['title', 'views'], ['Hello', ''])

    expect(result.ok).toBe(true)
    expect(result.ok === true && Object.hasOwn(result.record, 'views')).toBe(false)
  })
})

describe('toImportPayload', () => {
  it('strips engine-owned columns and lifts slug and status out of data', () => {
    const payload = toImportPayload({
      id: 'unwanted',
      created_at: 1,
      updated_at: 2,
      deleted_at: 3,
      slug: 'my-post',
      status: 'draft',
      title: 'Hello',
    })

    expect(payload).toEqual({ slug: 'my-post', status: 'draft', data: { title: 'Hello' } })
  })

  it('omits slug and status entirely when the record leaves them blank', () => {
    const payload = toImportPayload({ slug: '', title: 'Hello' })

    expect(payload).toEqual({ data: { title: 'Hello' } })
  })
})
