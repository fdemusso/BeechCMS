// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { contentBulkBodySchema, contentEntryBodySchema, contentListQuerySchema, kanbanMoveBodySchema } from './crud.schema'
import { MAX_BULK_SIZE } from './trash.schema'

const idsOf = (count: number) => Array.from({ length: count }, (_, index) => `id-${index}`)

/** The first issue decides which problem the handler answers, so it is what the contract is pinned on. */
function firstIssue(result: { error?: { issues: Array<{ code: string; path: PropertyKey[] }> } }) {
  const issue = result.error?.issues[0]
  return { code: issue?.code, key: issue?.path[0] }
}

describe('contentEntryBodySchema', () => {
  it.each([[null], [[]], [5], [{}], [{ title: 'a', updated_at: 1 }]])(
    'accepts %j, because the handler reads anything that is not an object as an empty body',
    (body) => {
      const result = contentEntryBodySchema.safeParse(body)

      expect(result.success).toBe(true)
    },
  )
})

describe('contentListQuerySchema', () => {
  it('accepts an empty query and keeps only the keys the dashboard sends', () => {
    const result = contentListQuerySchema.safeParse({ page: 'abc', has_pending_draft: '1', extra: 'x' })

    expect(result.data).toEqual({ page: 'abc', has_pending_draft: '1' })
  })
})

describe('contentBulkBodySchema', () => {
  it('accepts exactly MAX_BULK_SIZE ids with one field', () => {
    const result = contentBulkBodySchema.safeParse({ ids: idsOf(MAX_BULK_SIZE), fields: { title: 'x' } })

    expect(result.success).toBe(true)
  })

  it.each([[null], [[]], [5], [{}], [{ ids: [], fields: { a: 1 } }], [{ ids: 'id-1', fields: { a: 1 } }], [{ ids: ['id-1', 2], fields: { a: 1 } }]])(
    'refuses %j at ids with an issue that is not the size refinement',
    (body) => {
      const result = contentBulkBodySchema.safeParse(body)

      const { code, key } = firstIssue(result)
      expect(result.success).toBe(false)
      expect(code).not.toBe('custom')
      expect(key === 'ids' || key === undefined).toBe(true)
    },
  )

  it('refuses more than MAX_BULK_SIZE ids with the size refinement on ids', () => {
    const result = contentBulkBodySchema.safeParse({ ids: idsOf(MAX_BULK_SIZE + 1), fields: { a: 1 } })

    expect(firstIssue(result)).toEqual({ code: 'custom', key: 'ids' })
  })

  it('reports an oversized list that holds a non-string id with an element issue, not the size one', () => {
    const ids: unknown[] = idsOf(MAX_BULK_SIZE + 1)
    ids[0] = 7

    const result = contentBulkBodySchema.safeParse({ ids, fields: { a: 1 } })

    expect(firstIssue(result).code).not.toBe('custom')
  })

  it('reports an oversized list ahead of bad fields, as the size check ran first', () => {
    const result = contentBulkBodySchema.safeParse({ ids: idsOf(MAX_BULK_SIZE + 1), fields: [] })

    expect(firstIssue(result)).toEqual({ code: 'custom', key: 'ids' })
  })

  it.each([[{ ids: ['a'] }], [{ ids: ['a'], fields: null }], [{ ids: ['a'], fields: ['x'] }], [{ ids: ['a'], fields: 'x' }], [{ ids: ['a'], fields: {} }]])(
    'refuses %j at fields',
    (body) => {
      const result = contentBulkBodySchema.safeParse(body)

      expect(firstIssue(result).key).toBe('fields')
    },
  )
})

describe('kanbanMoveBodySchema', () => {
  it.each([
    [{ position: 'a', axisBranchId: 'br_11' }],
    [{ position: 'a', axisBranchId: 'br_11', axis: { value: 'high' } }],
    [{ position: 'a', axisBranchId: 'br_11', axis: { value: null } }],
  ])('accepts %j', (body) => {
    const result = kanbanMoveBodySchema.safeParse(body)

    expect(result.success).toBe(true)
  })

  it.each([[null], [[]], [5], [{}], [{ position: '', axisBranchId: 'br_11' }], [{ position: 'a', axisBranchId: '' }], [{ position: 1, axisBranchId: 'br_11' }]])(
    'refuses %j at the required strings',
    (body) => {
      const result = kanbanMoveBodySchema.safeParse(body)

      expect(result.success).toBe(false)
      expect(firstIssue(result).key).not.toBe('axis')
    },
  )

  it.each([
    [{ position: 'a', axisBranchId: 'br_11', axis: null }],
    [{ position: 'a', axisBranchId: 'br_11', axis: {} }],
    [{ position: 'a', axisBranchId: 'br_11', axis: { value: 3 } }],
    [{ position: 'a', axisBranchId: 'br_11', axis: { kind: 'tags', oldValue: 'a', newValue: 'b' } }],
  ])('refuses %j at axis', (body) => {
    const result = kanbanMoveBodySchema.safeParse(body)

    expect(firstIssue(result).key).toBe('axis')
  })

  it('reads a body wrong in both ways as the required strings, as they were checked first', () => {
    const result = kanbanMoveBodySchema.safeParse({ position: '', axisBranchId: 'br_11', axis: null })

    expect(firstIssue(result).key).toBe('position')
  })
})
