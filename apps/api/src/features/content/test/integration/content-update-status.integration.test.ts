// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — update status integration tier. A PUT /api/content/:slug/:id that does not send
 * `status` must leave the stored status alone, including when a publish lands while the PUT is in
 * flight. Real D1 through the harness, so the persisted status is what is asserted.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — update status (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  // Set by a test to run once inside the next repository.update, after the handler's read.
  let duringNextUpdate: ((id: string) => Promise<void>) | null

  async function storedStatus(id: string): Promise<string | undefined> {
    const row = await harness.db.prepare('SELECT status FROM content_posts WHERE id = ?').bind(id).first<{ status: string }>()
    return row?.status
  }

  async function createDraft(slug: string): Promise<string> {
    const created = await admin.post('/api/content/posts', { title: 'First', slug, status: 'draft' })
    expect(created.status).toBe(201) // precondition
    return (await created.json<{ id: string }>()).id
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    duringNextUpdate = null
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({
        seeds: [],
        authProviders,
        hooks: {
          beforeUpdate: async (id) => {
            const run = duringNextUpdate
            duringNextUpdate = null
            if (run) await run(id)
          },
        },
      }),
    })
    admin = await harness.asUser('admin')
  })

  it('a field-only PUT without If-Match keeps a publish that lands between its read and its write', async () => {
    const id = await createDraft('status-race-1')
    let publishStatus: number | undefined
    // beforeUpdate runs inside repository.update, after updateHandler has read the entry as draft:
    // a deterministic stand-in for a second request publishing it concurrently.
    duringNextUpdate = async (entryId) => {
      publishStatus = (await admin.put(`/api/content/posts/${entryId}`, { status: 'published' })).status
    }

    const response = await admin.put(`/api/content/posts/${id}`, { title: 'Edited' })

    expect(response.status).toBe(200)
    expect(publishStatus).toBe(200)
    // Regression guard: the handler used to write back the status it read before the publish.
    expect(await storedStatus(id)).toBe('published')
  })

  it('a PUT that sends status still writes it', async () => {
    const id = await createDraft('status-send-1')

    const response = await admin.put(`/api/content/posts/${id}`, { title: 'Edited', status: 'review' })

    expect(response.status).toBe(200)
    expect(await storedStatus(id)).toBe('review')
  })
})
