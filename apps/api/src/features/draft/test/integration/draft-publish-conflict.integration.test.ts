// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Draft slice — publish-conflict integration tier.
 * Covers POST /api/content/:slug/:id/draft/publish against real D1 through the full middleware
 * chain: the 409 on a stale draft, the happy path, and the legacy NULL-snapshot escape hatch.
 * The repository's SQL shape is unit tested in
 * apps/api/src/shared/db/repositories/content.repository.d1.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('draft slice — publish conflict integration (real D1)', () => {
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

  it('publishing a draft whose live entry was edited in the meantime answers 409 draft-publish-conflict', async () => {
    const created = await admin.post('/api/content/posts', {
      title: 'Original',
      slug: 'draft-conflict-1',
      status: 'published',
    })
    const { id } = await created.json<{ id: string }>()
    await admin.put(`/api/content/posts/${id}/draft`, { title: 'Draft title' })
    // unixepoch() is second-granular. Going through the PUT route for the "other writer" edit
    // could land in the same second as the draft's snapshot and never trigger the race this
    // test proves — sleeping is forbidden, so the later write is forced directly.
    await harness.db
      .prepare(`UPDATE content_posts SET title = ?, updated_at = updated_at + 10 WHERE id = ?`)
      .bind('Other writer title', id)
      .run()

    const response = await admin.post(`/api/content/posts/${id}/draft/publish`)

    expect(response.status).toBe(409)
    const body = await response.json<{ type: string; status: number }>()
    expect(body.type).toBe('https://beechcms.dev/problems/draft-publish-conflict')

    const live = await admin.get(`/api/content/posts/${id}`)
    const liveBody = await live.json<{ title: string }>()
    expect(liveBody.title).toBe('Other writer title')
    expect((await admin.get(`/api/content/posts/${id}/draft`)).status).toBe(200)
  })

  it('publishing an untouched draft promotes it and removes the draft row', async () => {
    const created = await admin.post('/api/content/posts', {
      title: 'Original',
      slug: 'draft-conflict-2',
      status: 'published',
    })
    const { id } = await created.json<{ id: string }>()
    await admin.put(`/api/content/posts/${id}/draft`, { title: 'Promoted title' })

    const response = await admin.post(`/api/content/posts/${id}/draft/publish`)

    expect(response.status).toBe(200)
    const live = await admin.get(`/api/content/posts/${id}`)
    const liveBody = await live.json<{ title: string; id: string }>()
    expect(liveBody.id).toMatch(UUID_V4_PATTERN)
    expect(liveBody.title).toBe('Promoted title')
    expect((await admin.get(`/api/content/posts/${id}/draft`)).status).toBe(404)
  })

  it('a draft whose live_snapshot_at is null publishes without a conflict check', async () => {
    const created = await admin.post('/api/content/posts', {
      title: 'Original',
      slug: 'draft-conflict-3',
      status: 'published',
    })
    const { id } = await created.json<{ id: string }>()
    await admin.put(`/api/content/posts/${id}/draft`, { title: 'Legacy draft title' })
    // Simulates a draft written before this column existed: legacy rows carry NULL and the
    // claim's `? IS NULL` branch must let them publish unconditionally.
    await harness.db
      .prepare(`UPDATE content_posts_drafts SET live_snapshot_at = NULL WHERE entry_id = ?`)
      .bind(id)
      .run()
    await harness.db
      .prepare(`UPDATE content_posts SET updated_at = updated_at + 10 WHERE id = ?`)
      .bind(id)
      .run()

    const response = await admin.post(`/api/content/posts/${id}/draft/publish`)

    expect(response.status).toBe(200)
    const live = await admin.get(`/api/content/posts/${id}`)
    const liveBody = await live.json<{ title: string }>()
    expect(liveBody.title).toBe('Legacy draft title')
  })

  it('an entry created directly in draft status publishes without a conflict check', async () => {
    const created = await admin.post('/api/content/posts', {
      title: 'Born as draft',
      slug: 'draft-conflict-4',
    })
    const { id } = await created.json<{ id: string }>()

    const response = await admin.post(`/api/content/posts/${id}/draft/publish`)

    expect(response.status).toBe(200)
    const live = await admin.get(`/api/content/posts/${id}`)
    const liveBody = await live.json<{ status: string }>()
    expect(liveBody.status).toBe('published')
  })
})
