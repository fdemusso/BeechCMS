// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — update-conflict integration tier.
 * Covers PUT /api/content/:slug/:id's optimistic concurrency guard against real D1: the 409 on
 * a stale If-Match or body `updated_at`, and the happy path when the caller's version is current.
 * The repository's SQL shape is unit tested in
 * apps/api/src/shared/db/repositories/content.repository.d1.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — update conflict integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  it('a PUT carrying a stale If-Match answers 409 content-update-conflict and leaves the row untouched', async () => {
    const created = await admin.post('/api/content/posts', { title: 'Original', slug: 'occ-if-match-1' })
    const { id } = await created.json<{ id: string }>()
    const before = await (await admin.get(`/api/content/posts/${id}`)).json<{ updated_at: number }>()
    // unixepoch() is second-granular; force the "other writer" edit into a later second so the
    // If-Match guard has something to actually catch.
    await harness.db
      .prepare(`UPDATE content_posts SET title = ?, updated_at = updated_at + 10 WHERE id = ?`)
      .bind('Other writer title', id)
      .run()

    const response = await admin.put(`/api/content/posts/${id}`, { title: 'Stale write' }, {
      headers: { 'If-Match': String(before.updated_at) },
    })

    expect(response.status).toBe(409)
    const body = await response.json<{ type: string; status: number }>()
    expect(body.type).toBe('https://beechcms.dev/problems/content-update-conflict')

    const live = await admin.get(`/api/content/posts/${id}`)
    const liveBody = await live.json<{ title: string }>()
    expect(liveBody.title).toBe('Other writer title')
  })

  it('a PUT carrying a stale body updated_at answers 409 content-update-conflict and leaves the row untouched', async () => {
    const created = await admin.post('/api/content/posts', { title: 'Original', slug: 'occ-body-1' })
    const { id } = await created.json<{ id: string }>()
    const before = await (await admin.get(`/api/content/posts/${id}`)).json<{ updated_at: number }>()
    await harness.db
      .prepare(`UPDATE content_posts SET title = ?, updated_at = updated_at + 10 WHERE id = ?`)
      .bind('Other writer title', id)
      .run()

    const response = await admin.put(`/api/content/posts/${id}`, {
      title: 'Stale write',
      updated_at: before.updated_at,
    })

    expect(response.status).toBe(409)
    const live = await admin.get(`/api/content/posts/${id}`)
    const liveBody = await live.json<{ title: string }>()
    expect(liveBody.title).toBe('Other writer title')
  })

  it('a PUT carrying the current If-Match value applies the write', async () => {
    const created = await admin.post('/api/content/posts', { title: 'Original', slug: 'occ-if-match-2' })
    const { id } = await created.json<{ id: string }>()
    const before = await (await admin.get(`/api/content/posts/${id}`)).json<{ updated_at: number }>()

    const response = await admin.put(`/api/content/posts/${id}`, { title: 'Fresh write' }, {
      headers: { 'If-Match': String(before.updated_at) },
    })

    expect(response.status).toBe(200)
    const live = await admin.get(`/api/content/posts/${id}`)
    const liveBody = await live.json<{ title: string }>()
    expect(liveBody.title).toBe('Fresh write')
  })

  it('a PUT with no If-Match and no body updated_at applies unconditionally, unchanged from before OCC', async () => {
    const created = await admin.post('/api/content/posts', { title: 'Original', slug: 'occ-no-guard' })
    const { id } = await created.json<{ id: string }>()
    await harness.db
      .prepare(`UPDATE content_posts SET title = ?, updated_at = updated_at + 10 WHERE id = ?`)
      .bind('Other writer title', id)
      .run()

    const response = await admin.put(`/api/content/posts/${id}`, { title: 'Unconditional write' })

    expect(response.status).toBe(200)
    const live = await admin.get(`/api/content/posts/${id}`)
    const liveBody = await live.json<{ title: string }>()
    expect(liveBody.title).toBe('Unconditional write')
  })
})
