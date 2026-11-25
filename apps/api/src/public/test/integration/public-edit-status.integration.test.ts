// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — edit status integration tier. A public edit that does not send `status` must leave the
 * stored status alone, including when the dashboard changes it while the edit is in flight. Real D1
 * through the harness, so the persisted status is what is asserted.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, TEST_SECRET_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const titleBranch = { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } } as const

const blogSeed = defineSeed({ slug: 'blog', label: 'Blog', displayNameAlias: 'title', allowPublicRead: true, allowPublicEdit: true, branches: [titleBranch] })

describe('public slice — edit status (real D1)', () => {
  let harness: TestHarness
  let secretClient: TestClient
  let admin: TestClient
  // Set by a test to run once inside the next repository.update, after the public handler's read.
  let duringNextUpdate: ((id: string) => Promise<void>) | null

  async function storedStatus(id: string): Promise<string | undefined> {
    const row = await harness.db.prepare('SELECT status FROM content_blog WHERE id = ?').bind(id).first<{ status: string }>()
    return row?.status
  }

  async function createDraft(): Promise<string> {
    const response = await secretClient.post('/api/v1/public/blog/add', { data: { title: 'First' }, status: 'draft' })
    return (await response.json<{ id: string }>()).id
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    duringNextUpdate = null
    harness = await createTestHarness({
      db: env.DB,
      seeds: [blogSeed],
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
    secretClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_SECRET_KEY })
    admin = await harness.asUser('admin')
  })

  it('a field-only edit keeps a publish that lands between its read and its write', async () => {
    const id = await createDraft()
    let publishStatus: number | undefined
    // beforeUpdate runs inside repository.update, after publicEditHandler has read the entry as draft:
    // a deterministic stand-in for a dashboard publish racing the public edit.
    duringNextUpdate = async (entryId) => {
      publishStatus = (await admin.put(`/api/content/blog/${entryId}`, { status: 'published' })).status
    }

    const response = await secretClient.put(`/api/v1/public/blog/edit/${id}`, { data: { title: 'Edited' } })

    expect(response.status).toBe(200)
    expect(publishStatus).toBe(200)
    // Regression guard: the handler used to write back the status it read before the publish.
    expect(await storedStatus(id)).toBe('published')
  })

  it('an edit that sends status still writes it', async () => {
    const id = await createDraft()

    const response = await secretClient.put(`/api/v1/public/blog/edit/${id}`, { data: { title: 'Edited' }, status: 'review' })

    expect(response.status).toBe(200)
    expect(await storedStatus(id)).toBe('review')
  })
})
