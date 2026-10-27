// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import {
  BODY_NOT_OBJECT_DETAIL,
  BRANCH_TYPES,
  NEW_ALIAS_DETAIL,
  NEW_TYPE_DETAIL,
  SLUG_DETAIL,
  branchBodySchema,
  confirmBodySchema,
  createSeedBodySchema,
  renameBranchBodySchema,
  retypeBranchBodySchema,
  seedBodySchema,
} from './seeds.schema'

/** The detail the 400 carries: the message of the first issue, which is the first old rejection. */
function firstDetail(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.error?.issues[0]?.message
}

describe('seedBodySchema', () => {
  it.each([[null], [[]], ['seed'], [7], [true]])('refuses %j with the not-an-object detail', (body) => {
    const result = seedBodySchema.safeParse(body)

    expect(result.success).toBe(false)
    expect(firstDetail(result)).toBe(BODY_NOT_OBJECT_DETAIL)
  })

  it('accepts any object, leaving the seed rules to seed validation', () => {
    const result = seedBodySchema.safeParse({ branches: [null] })

    expect(result.success).toBe(true)
  })
})

describe('createSeedBodySchema', () => {
  it('refuses a body that is not an object before looking at the slug', () => {
    const result = createSeedBodySchema.safeParse(null)

    expect(firstDetail(result)).toBe(BODY_NOT_OBJECT_DETAIL)
  })

  it.each([
    ['missing', {}],
    ['empty', { slug: '' }],
    ['upper case', { slug: 'Articles' }],
    ['with a dash', { slug: 'my-articles' }],
    ['not a string', { slug: 5 }],
    ['a boolean, which would coerce to "true" through RegExp.test', { slug: true }],
  ])('refuses a slug that is %s with the slug detail', (_label, body) => {
    const result = createSeedBodySchema.safeParse(body)

    expect(result.success).toBe(false)
    expect(firstDetail(result)).toBe(SLUG_DETAIL)
  })

  it('accepts a valid slug and keeps every other key', () => {
    const result = createSeedBodySchema.safeParse({ slug: 'articles_2', label: 'Articles', branches: [] })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ slug: 'articles_2', label: 'Articles', branches: [] })
  })
})

describe('branchBodySchema', () => {
  it.each([[null], [[]], ['branch']])('refuses %j with the not-an-object detail', (body) => {
    const result = branchBodySchema.safeParse(body)

    expect(firstDetail(result)).toBe(BODY_NOT_OBJECT_DETAIL)
  })

  it('accepts a branch without an id, which the server mints', () => {
    const result = branchBodySchema.safeParse({ alias: 'summary', label: 'Summary', type: 'text' })

    expect(result.success).toBe(true)
  })
})

describe('confirmBodySchema', () => {
  // The expected token depends on a record loaded after the body, so the schema must not decide:
  // requireConfirm answers 400 confirmation-required for each of these, as before.
  it.each([[null], [[]], [5], [{}], [{ confirm: 7 }]])('lets %j through for requireConfirm to refuse', (body) => {
    const result = confirmBodySchema.safeParse(body)

    expect(result.success).toBe(true)
  })
})

describe('renameBranchBodySchema', () => {
  it('accepts a valid alias and keeps the confirmation', () => {
    const result = renameBranchBodySchema.safeParse({ newAlias: 'headline', confirm: 'articles.title' })

    expect(result.data).toEqual({ newAlias: 'headline', confirm: 'articles.title' })
  })

  it('lets a body without a confirmation through, for requireConfirm to refuse after the branch is found', () => {
    const result = renameBranchBodySchema.safeParse({ newAlias: 'headline' })

    expect(result.success).toBe(true)
  })

  it.each([[null], [[]], ['headline'], [{}], [{ newAlias: 5 }], [{ newAlias: 'Not Valid!' }], [{ newAlias: '9lives' }]])(
    'refuses %j with the alias-format detail',
    (body) => {
      const result = renameBranchBodySchema.safeParse(body)

      expect(result.success).toBe(false)
      expect(firstDetail(result)).toBe(NEW_ALIAS_DETAIL)
    },
  )

  it.each(['id', 'slug', 'select', 'pluck'])('refuses the reserved alias %s with the reason it is reserved', (newAlias) => {
    const result = renameBranchBodySchema.safeParse({ newAlias, confirm: 'articles.title' })

    expect(result.success).toBe(false)
    expect(firstDetail(result)).not.toBe(NEW_ALIAS_DETAIL)
    expect(firstDetail(result)).toMatch(/reserved|collides|system/i)
  })
})

describe('retypeBranchBodySchema', () => {
  it('lets a body without a confirmation through, for requireConfirm to refuse after the branch is found', () => {
    const result = retypeBranchBodySchema.safeParse({ newType: 'number' })

    expect(result.success).toBe(true)
  })

  it.each(BRANCH_TYPES)('accepts %s', (newType) => {
    const result = retypeBranchBodySchema.safeParse({ newType, confirm: 'articles.title' })

    expect(result.success).toBe(true)
  })

  it.each([[null], [[]], [{}], [{ newType: 5 }], [{ newType: 'varchar' }], [{ newType: 'TEXT' }]])(
    'refuses %j with the type-list detail',
    (body) => {
      const result = retypeBranchBodySchema.safeParse(body)

      expect(result.success).toBe(false)
      expect(firstDetail(result)).toBe(NEW_TYPE_DETAIL)
    },
  )
})
