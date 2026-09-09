// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1SeedRepository } from './seed.repository.d1'
import type { Seed } from '@beechcms/core'

const mockSeed: Seed = {
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
}

function makeMockDb(opts: {
  firstResult?: unknown
  allResults?: unknown[]
  runOk?: boolean
  batchImpl?: (statements: unknown[]) => Promise<unknown>
} = {}) {
  const { firstResult = null, allResults = [], runOk = true, batchImpl } = opts
  const runMock = vi.fn().mockResolvedValue({ success: runOk })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const preparedStatements: { sql: string; bindArgs?: unknown[] }[] = []
  const bindMock = vi.fn(function (this: { sql: string; bindArgs?: unknown[] }, ...args: unknown[]) {
    this.bindArgs = args
    return this
  })
  const prepareMock = vi.fn((sql: string) => {
    const stmt = { sql, bindArgs: undefined as unknown[] | undefined, bind: bindMock, run: runMock, first: firstMock, all: allMock }
    preparedStatements.push(stmt)
    return stmt
  })
  const batchMock = vi.fn(batchImpl ?? (async () => []))
  return {
    db: { prepare: prepareMock, batch: batchMock } as unknown as D1Database,
    prepareMock,
    bindMock,
    runMock,
    firstMock,
    allMock,
    batchMock,
    preparedStatements,
  }
}

describe('D1SeedRepository', () => {
  describe('listActive', () => {
    it('queries active seeds ordered by created_at ASC', async () => {
      const row = { definition: JSON.stringify(mockSeed) }
      const { db, prepareMock } = makeMockDb({ allResults: [row] })
      const repo = new D1SeedRepository(db)
      const result = await repo.listActive()
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"))
      expect(result).toHaveLength(1)
      expect(result[0].slug).toBe('posts')
    })

    it('skips corrupt JSON rows without throwing', async () => {
      const { db } = makeMockDb({ allResults: [{ definition: 'not-json' }] })
      const result = await new D1SeedRepository(db).listActive()
      expect(result).toHaveLength(0)
    })
  })

  describe('listAll', () => {
    it('returns all rows including deleted', async () => {
      const row = {
        slug: 'posts',
        definition: JSON.stringify(mockSeed),
        status: 'deleted',
        source: 'code',
        created_at: 1000,
        updated_at: 2000,
      }
      const { db } = makeMockDb({ allResults: [row] })
      const result = await new D1SeedRepository(db).listAll()
      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('deleted')
      expect(result[0].source).toBe('code')
    })
  })

  describe('get', () => {
    it('returns a SeedRecord when found', async () => {
      const row = {
        slug: 'posts',
        definition: JSON.stringify(mockSeed),
        status: 'active',
        source: 'runtime',
        created_at: 1000,
        updated_at: 1000,
      }
      const { db, bindMock } = makeMockDb({ firstResult: row })
      const result = await new D1SeedRepository(db).get('posts')
      expect(result).not.toBeNull()
      expect(result!.slug).toBe('posts')
      expect(bindMock).toHaveBeenCalledWith('posts')
    })

    it('returns null when not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1SeedRepository(db).get('ghost')).toBeNull()
    })
  })

  describe('upsert', () => {
    it('prepares INSERT … ON CONFLICT statement with correct bindings', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1SeedRepository(db).upsert('posts', mockSeed)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'))
      const [slug, definition, source] = (bindMock.mock.calls[0] ?? []) as string[]
      expect(slug).toBe('posts')
      expect(JSON.parse(definition).slug).toBe('posts')
      expect(source).toBe('runtime')
    })

    it('passes source=code when specified', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1SeedRepository(db).upsert('posts', mockSeed, 'code')
      expect(((bindMock.mock.calls[0] ?? []) as string[])[2]).toBe('code')
    })
  })

  describe('softDelete', () => {
    it('issues UPDATE SET status=deleted', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1SeedRepository(db).softDelete('posts')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining("status = 'deleted'"))
      expect(bindMock.mock.calls[0]).toContain('posts')
    })
  })

  describe('getRegistryVersion', () => {
    it('returns parsed integer from seed_meta', async () => {
      const { db } = makeMockDb({ firstResult: { value: '7' } })
      expect(await new D1SeedRepository(db).getRegistryVersion()).toBe(7)
    })

    it('returns 1 when row not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1SeedRepository(db).getRegistryVersion()).toBe(1)
    })
  })

  describe('bumpRegistryVersion', () => {
    it('issues UPDATE … RETURNING and returns new version', async () => {
      const { db, prepareMock } = makeMockDb({ firstResult: { value: '5' } })
      const result = await new D1SeedRepository(db).bumpRegistryVersion()
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('RETURNING'))
      expect(result).toBe(5)
    })

    it('returns 1 as fallback when RETURNING yields nothing', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1SeedRepository(db).bumpRegistryVersion()).toBe(1)
    })
  })

  describe('applyAtomic', () => {
    it('issues exactly one db.batch() with statements in order: guard, DDL, upsert, bump', async () => {
      const { db, batchMock } = makeMockDb()
      const ddl = ['ALTER TABLE content_posts ADD COLUMN price REAL']
      await new D1SeedRepository(db).applyAtomic({
        slug: 'posts',
        definition: mockSeed,
        ddl,
        expectedVersion: 3,
      })

      expect(batchMock).toHaveBeenCalledTimes(1)
      const batched = batchMock.mock.calls[0]![0] as { sql: string }[]
      expect(batched).toHaveLength(1 + ddl.length + 2)

      expect(batched[0]!.sql).toContain('INSERT INTO seed_meta')
      expect(batched[1]!.sql).toBe(ddl[0])
      expect(batched[2]!.sql).toContain('INSERT INTO seeds')
      expect(batched[3]!.sql).toContain('UPDATE seed_meta')
      expect(batched[3]!.sql).toContain('registry_version')
    })

    it('returns applied:true with version = expectedVersion + 1 on success', async () => {
      const { db } = makeMockDb()
      const result = await new D1SeedRepository(db).applyAtomic({
        slug: 'posts',
        definition: mockSeed,
        ddl: [],
        expectedVersion: 3,
      })
      expect(result).toEqual({ applied: true, version: 4 })
    })

    it('CAS guard conflict: a UNIQUE constraint error yields applied:false and leaves the batch unwritten', async () => {
      const { db, batchMock } = makeMockDb({
        firstResult: { value: '9' },
        batchImpl: async () => { throw new Error('D1_ERROR: UNIQUE constraint failed: seed_meta.id') },
      })
      const result = await new D1SeedRepository(db).applyAtomic({
        slug: 'posts',
        definition: mockSeed,
        ddl: ['ALTER TABLE content_posts ADD COLUMN price REAL'],
        expectedVersion: 3,
      })
      expect(batchMock).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ applied: false, version: 9 })
    })

    it('re-throws a genuine DDL failure instead of swallowing it as a conflict', async () => {
      const { db } = makeMockDb({
        batchImpl: async () => { throw new Error('D1_ERROR: table content_posts already exists') },
      })
      await expect(
        new D1SeedRepository(db).applyAtomic({ slug: 'posts', definition: mockSeed, ddl: [], expectedVersion: 3 })
      ).rejects.toThrow('already exists')
    })

    it('binds source=runtime by default and honors an explicit source', async () => {
      const { db, bindMock, preparedStatements } = makeMockDb()
      await new D1SeedRepository(db).applyAtomic({
        slug: 'posts',
        definition: mockSeed,
        ddl: [],
        expectedVersion: 1,
        source: 'code',
      })
      const upsertBindArgs = preparedStatements.find(s => s.sql.includes('INSERT INTO seeds'))?.bindArgs
      expect(upsertBindArgs?.[2]).toBe('code')
      expect(bindMock).toHaveBeenCalled()
    })
  })
})
