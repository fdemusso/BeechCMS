// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Seed, SchemaQueryExecutor } from '@beechcms/core'

vi.mock('../lib/d1-context.js', () => ({
  createD1Context: vi.fn(),
  loadLiveSeeds: vi.fn(),
  exitWithError: vi.fn(),
}))

import { createD1Context, loadLiveSeeds, exitWithError } from '../lib/d1-context.js'
import { schemaAudit } from '../commands/schema-audit.js'

type Rows = Record<string, unknown>[]

function fakeExecutor(responses: Record<string, Rows>): SchemaQueryExecutor {
  return {
    all: <T extends Record<string, unknown>>(sql: string): Promise<T[]> => {
      const rows = responses[sql]
      if (!rows) return Promise.reject(new Error(`unstubbed statement: ${sql}`))
      return Promise.resolve(rows as T[])
    },
  }
}

const POSTS: Seed = {
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true }],
}

const contentPosts = (columns: string[]): Record<string, Rows> => ({
  'PRAGMA table_info(content_posts)': columns.map((name, cid) => ({ cid, name, type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 })),
  'PRAGMA foreign_key_list(content_posts)': [],
  'PRAGMA index_list(content_posts)': [],
})

function arrange(responses: Record<string, Rows>): void {
  vi.mocked(createD1Context).mockReturnValue({ executor: fakeExecutor(responses), options: { db: 'beech-db', local: true, configPath: '' } })
  vi.mocked(loadLiveSeeds).mockResolvedValue([POSTS])
}

describe('schemaAudit', () => {
  let exit: ReturnType<typeof vi.spyOn>
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('prints a clean report and does not set a failing exit code when storage matches', async () => {
    arrange({
      ...contentPosts(['id']),
      'PRAGMA table_info(rel_posts_tags)': [{ cid: 0, name: 'parent_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 }],
      'PRAGMA foreign_key_list(rel_posts_tags)': [{ id: 0, seq: 0, table: 'content_tags', from: 'target_id', to: 'id', on_update: 'NO ACTION', on_delete: 'CASCADE' }],
      'PRAGMA index_list(rel_posts_tags)': [],
      'PRAGMA table_info(rel_posts_tags_drafts)': [],
    })

    await schemaAudit({ local: true })

    expect(exit).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Every relation branch matches'))
  })

  it('lists the stranded value count and exits 1 when a mismatch exists', async () => {
    arrange({
      ...contentPosts(['id', 'tags']),
      'PRAGMA table_info(rel_posts_tags)': [],
      'PRAGMA table_info(rel_posts_tags_drafts)': [],
      'SELECT COUNT(*) AS n FROM content_posts WHERE "tags" IS NOT NULL': [{ n: 4 }],
    })

    await schemaAudit({ local: true })

    expect(exit).toHaveBeenCalledWith(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('4 stranded value(s)'))
  })

  it('routes an unreadable database to the shared error renderer', async () => {
    vi.mocked(createD1Context).mockImplementation(() => { throw new Error('no D1') })

    await schemaAudit({ local: true })

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({ message: 'no D1' }))
  })
})
