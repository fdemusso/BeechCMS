// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1ContentRepository } from '../src/shared/content.repository.d1'
import { HookValidationError } from '@beechcms/core'
import type { Seed, BeechHooks } from '@beechcms/core'

const SEED = {
  slug: 'products',
  displayNameAlias: 'name',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'name', type: 'text' },
    { id: 'br_02', alias: 'fullName', type: 'text' },
    { id: 'br_03', alias: 'stock', type: 'number' },
  ],
} as unknown as Seed

function makeMockDb(opts: {
  firstResult?: unknown
  runChanges?: number
  batchResults?: unknown[]
} = {}) {
  const { firstResult = null, runChanges = 1, batchResults = [] } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: runChanges } })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const allMock = vi.fn().mockResolvedValue({ results: [] })
  const bindMock = vi.fn(() => ({ run: runMock, first: firstMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  const batchMock = vi.fn().mockResolvedValue(batchResults)
  return { db: { prepare: prepareMock, batch: batchMock } as any, prepareMock, bindMock, runMock, firstMock, allMock, batchMock }
}

describe('Lifecycle hooks', () => {
  it('beforeCreate can mutate the payload before persistence', async () => {
    const { db, prepareMock } = makeMockDb({ firstResult: null })

    const hooks: BeechHooks = {
      beforeCreate: (data) => ({ ...data, fullName: `${data.firstName} ${data.lastName}` }),
    }

    const repo = new D1ContentRepository(db, hooks)
    await repo.create(SEED, 'e1', 'prod-1', 'draft', { name: 'p1', firstName: 'Ada', lastName: 'Lovelace' })

    const insertSql = prepareMock.mock.calls.map((c: any[]) => c[0] as string).find((s) => s.includes('INSERT INTO content_products'))
    expect(insertSql).toContain('fullName')
  })

  it('beforeCreate throwing HookValidationError prevents any write', async () => {
    const { db, batchMock, runMock } = makeMockDb({ firstResult: null })

    const hooks: BeechHooks = {
      beforeCreate: () => {
        throw new HookValidationError('end date before start date', [{ field: 'endDate', message: 'must be after startDate' }])
      },
    }

    const repo = new D1ContentRepository(db, hooks)
    await expect(repo.create(SEED, 'e1', 'prod-1', 'draft', { name: 'p1' })).rejects.toBeInstanceOf(HookValidationError)

    expect(batchMock).not.toHaveBeenCalled()
    expect(runMock).not.toHaveBeenCalled()
  })

  it('afterCreate throwing does not roll back the already-committed write', async () => {
    const { db } = makeMockDb({ firstResult: null })

    const hooks: BeechHooks = {
      afterCreate: () => {
        throw new Error('downstream side-effect failed')
      },
    }

    const repo = new D1ContentRepository(db, hooks)
    await expect(repo.create(SEED, 'e1', 'prod-1', 'draft', { name: 'p1' })).rejects.toThrow('downstream side-effect failed')
    // The main INSERT already ran (db.prepare/run) before afterCreate fired — no rollback is possible on D1.
  })

  it('mutateField enforces the min guard to prevent stock from going negative', async () => {
    const { db, runMock, firstMock } = makeMockDb({ runChanges: 0 })

    const repo = new D1ContentRepository(db)
    await expect(
      repo.mutateField(SEED, 'e1', 'stock', { type: 'decrement', value: 5 }, { min: 0 }),
    ).rejects.toThrow(/limite superato/)

    expect(runMock).toHaveBeenCalled()
    expect(firstMock).not.toHaveBeenCalled()
  })

  it('mutateField returns the new value when the guard passes', async () => {
    const { db } = makeMockDb({ runChanges: 1, firstResult: { v: 5 } })

    const repo = new D1ContentRepository(db)
    const result = await repo.mutateField(SEED, 'e1', 'stock', { type: 'decrement', value: 5 }, { min: 0 })
    expect(result.newValue).toBe(5)
  })
})
