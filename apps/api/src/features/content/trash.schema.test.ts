// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { MAX_BULK_SIZE, bulkIdsSchema, trashListQuerySchema } from './trash.schema'

const idsOf = (count: number) => Array.from({ length: count }, (_, index) => `id-${index}`)

describe('bulkIdsSchema', () => {
  it('accepts a list of exactly MAX_BULK_SIZE ids', () => {
    const result = bulkIdsSchema.safeParse({ ids: idsOf(MAX_BULK_SIZE) })

    expect(result.success).toBe(true)
  })

  it.each([[null], [[]], [5], [{}], [{ ids: [] }], [{ ids: 'id-1' }], [{ ids: ['id-1', 2] }]])(
    'refuses %j with at least one issue that is not the size refinement',
    (body) => {
      const result = bulkIdsSchema.safeParse(body)

      expect(result.success).toBe(false)
      expect(result.error?.issues.some((issue) => issue.code !== 'custom')).toBe(true)
    },
  )

  it('refuses more than MAX_BULK_SIZE ids with nothing but the size refinement', () => {
    const result = bulkIdsSchema.safeParse({ ids: idsOf(MAX_BULK_SIZE + 1) })

    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['custom'])
  })

  it('reports an oversized list that holds a non-string id with an element issue, not the size one', () => {
    const ids: unknown[] = idsOf(MAX_BULK_SIZE + 1)
    ids[0] = 7

    const result = bulkIdsSchema.safeParse({ ids })

    expect(result.error?.issues.some((issue) => issue.code !== 'custom')).toBe(true)
  })
})

describe('trashListQuerySchema', () => {
  it('accepts an empty query and keeps only page and limit', () => {
    const result = trashListQuerySchema.safeParse({ page: 'abc', limit: '', extra: 'x' })

    expect(result.data).toEqual({ page: 'abc', limit: '' })
  })
})
