// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Backrefs slice — pagination order, integration tier.
 * Entries sharing one `updated_at` (bulk imports) must page in a total order, otherwise
 * `LIMIT/OFFSET` across `?page=N` can repeat or skip entries.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const authorsSeed = defineSeed({
  slug: 'pg_br_authors',
  label: 'Author',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text' },
  ],
})

const postsSeed = defineSeed({
  slug: 'pg_br_posts',
  label: 'Post',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'pg_br_authors' },
  ],
})

const articlesSeed = defineSeed({
  slug: 'pg_br_articles',
  label: 'Article',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'authors', label: 'Authors', type: 'relation', targetSeed: 'pg_br_authors', multiple: true },
  ],
})

const TIED_UPDATED_AT = 1_700_000_000
const ENTRY_COUNT = 7
const PAGE_SIZE = 3

interface GroupBody {
  groups: { total: number; items: { id: string }[] }[]
}

describe('backrefs slice — pagination order (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [authorsSeed, postsSeed, articlesSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  async function createAuthor(): Promise<string> {
    const res = await admin.post('/api/content/pg_br_authors', { name: 'Alice', status: 'published' })
    expect(res.status).toBe(201)
    return (await res.json<{ id: string }>()).id
  }

  async function createTiedEntries(slug: string, fields: (i: number) => Record<string, unknown>): Promise<string[]> {
    const ids: string[] = []
    for (let i = 0; i < ENTRY_COUNT; i++) {
      const res = await admin.post(`/api/content/${slug}`, { title: `Entry ${i}`, status: 'published', ...fields(i) })
      expect(res.status).toBe(201)
      ids.push((await res.json<{ id: string }>()).id)
    }
    await harness.db.prepare(`UPDATE content_${slug} SET updated_at = ?`).bind(TIED_UPDATED_AT).run()
    return ids
  }

  async function pageIds(authorId: string, group: string, page: number): Promise<string[]> {
    const res = await admin.get(`/api/content/pg_br_authors/${authorId}/backrefs?group=${group}&page=${page}&limit=${PAGE_SIZE}`)
    expect(res.status).toBe(200)
    return (await res.json<GroupBody>()).groups[0].items.map(item => item.id)
  }

  it('pages single-relation entries with equal updated_at in ascending id order', async () => {
    const authorId = await createAuthor()
    const createdIds = await createTiedEntries('pg_br_posts', () => ({ author_id: authorId }))

    const paged = [
      ...await pageIds(authorId, 'pg_br_posts:author_id', 1),
      ...await pageIds(authorId, 'pg_br_posts:author_id', 2),
      ...await pageIds(authorId, 'pg_br_posts:author_id', 3),
    ]

    expect(paged).toEqual([...createdIds].sort())
  })

  it('pages multi-relation entries with equal updated_at in ascending id order', async () => {
    const authorId = await createAuthor()
    const createdIds = await createTiedEntries('pg_br_articles', () => ({ authors: [authorId] }))

    const paged = [
      ...await pageIds(authorId, 'pg_br_articles:authors', 1),
      ...await pageIds(authorId, 'pg_br_articles:authors', 2),
      ...await pageIds(authorId, 'pg_br_articles:authors', 3),
    ]

    expect(paged).toEqual([...createdIds].sort())
  })
})
