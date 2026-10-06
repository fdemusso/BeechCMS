// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — integration tier. An empty `in` membership filter must match nothing (AND) or
 * contribute a false disjunct (OR), never widen the result set to the whole collection.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, TEST_PUBLIC_READ_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

describe('public slice — integration (real D1) empty `in` filter', () => {
  let harness: TestHarness
  let admin: TestClient
  let publicClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    publicClient = harness.anonymous()
  })

  async function createPost(title: string, slug: string): Promise<string> {
    const res = await admin.post('/api/content/posts', { title, slug, status: 'published' })
    expect(res.status).toBe(201)
    return (await res.json<{ id: string }>()).id
  }

  async function listPublic(filter: unknown) {
    const response = await publicClient.get(`/api/v1/public/posts?filter=${encodeURIComponent(JSON.stringify(filter))}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })
    expect(response.status).toBe(200)
    return response.json<{ data: Array<{ id: string }>; meta: { total: number } }>()
  }

  it('returns no entries when an empty `in` is the only condition', async () => {
    await createPost('Alpha', 'empty-in-alpha')
    await createPost('Beta', 'empty-in-beta')

    const body = await listPublic({ where: [{ field: 'title', op: 'in', value: [] }] })

    expect(body.data).toEqual([])
    expect(body.meta.total).toBe(0)
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_posts').first<{ n: number }>()
    expect(row?.n).toBe(2)
  })

  it('keeps AND semantics: an empty `in` next to a matching condition still matches nothing', async () => {
    await createPost('Alpha', 'empty-in-and-alpha')

    const body = await listPublic({
      logic: 'AND',
      where: [{ field: 'title', op: 'in', value: [] }, { field: 'title', op: 'eq', value: 'Alpha' }],
    })

    expect(body.data).toEqual([])
  })

  it('treats an empty `in` as a false disjunct under OR', async () => {
    const alphaId = await createPost('Alpha', 'empty-in-or-alpha')
    await createPost('Beta', 'empty-in-or-beta')

    const body = await listPublic({
      logic: 'OR',
      where: [{ field: 'title', op: 'in', value: [] }, { field: 'title', op: 'eq', value: 'Alpha' }],
    })

    expect(body.data.map(d => d.id)).toEqual([alphaId])
  })
})
