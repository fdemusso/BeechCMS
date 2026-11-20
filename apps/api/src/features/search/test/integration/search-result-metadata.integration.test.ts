// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Search slice — result metadata, integration tier.
 * Covers `updated_at` and `author_name` on GET /api/search against real D1.
 * The RBAC projection of search is covered by apps/api/test/flow/flow-rbac-projections.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface SearchItem {
  id: string
  updated_at: number
  author_name: string | null
}

const SEARCH_ENDPOINT = '/api/search?q=Metadata&schema_slug=posts'

describe('search slice — result metadata (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  async function createPost(): Promise<string> {
    const response = await admin.post('/api/content/posts', { title: 'Metadata probe', slug: 'metadata-probe' })
    const { id } = await response.json<{ id: string }>()
    return id
  }

  // The real create row's created_at comes from D1's unixepoch() wall clock, not from the harness
  // FixedClock, so later rows are offset from it instead of using a literal timestamp.
  async function logActivityAfterCreate(
    entryId: string,
    action: string,
    actor: { id: string; email: string; name: string | null },
  ): Promise<void> {
    await harness.db
      .prepare(
        `INSERT INTO activity_logs (id, user_id, user_email, user_name, action, entity_type, entity_id, entity_slug, created_at)
         VALUES (?, ?, ?, ?, ?, 'content', ?, 'posts', (SELECT MAX(created_at) FROM activity_logs WHERE entity_id = ?) + 1)`,
      )
      .bind(crypto.randomUUID(), actor.id, actor.email, actor.name, action, entryId, entryId)
      .run()
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  describe('GET /api/search', () => {
    it('a freshly created entry carries the creator name and the live row updated_at', async () => {
      const entryId = await createPost()

      const response = await admin.get(SEARCH_ENDPOINT)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: SearchItem[] }>()
      const item = body.items.find(candidate => candidate.id === entryId)
      expect(item?.author_name).toBe(CANONICAL_USERS.admin.name)
      const liveRow = await harness.db
        .prepare('SELECT updated_at FROM content_posts WHERE id = ?')
        .bind(entryId)
        .first<{ updated_at: number }>()
      expect(item?.updated_at).toBe(liveRow?.updated_at)
    })

    it('a later update row by another account makes that account the author', async () => {
      const entryId = await createPost()
      await logActivityAfterCreate(entryId, 'update', CANONICAL_USERS.editor)

      const response = await admin.get(SEARCH_ENDPOINT)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: SearchItem[] }>()
      expect(body.items.find(candidate => candidate.id === entryId)?.author_name).toBe(CANONICAL_USERS.editor.name)
    })

    it('a later trash row does not change the author', async () => {
      const entryId = await createPost()
      await logActivityAfterCreate(entryId, 'trash', CANONICAL_USERS.editor)

      const response = await admin.get(SEARCH_ENDPOINT)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: SearchItem[] }>()
      expect(body.items.find(candidate => candidate.id === entryId)?.author_name).toBe(CANONICAL_USERS.admin.name)
    })

    it('a writer with no name is shown by e-mail', async () => {
      const entryId = await createPost()
      await logActivityAfterCreate(entryId, 'update', { ...CANONICAL_USERS.editor, name: null })

      const response = await admin.get(SEARCH_ENDPOINT)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: SearchItem[] }>()
      expect(body.items.find(candidate => candidate.id === entryId)?.author_name).toBe(CANONICAL_USERS.editor.email)
    })

    it('an entry with no create, update or publish activity carries author_name null', async () => {
      const entryId = await createPost()
      // Simulates entries imported or seeded before activity logging existed.
      await harness.db.prepare('DELETE FROM activity_logs WHERE entity_id = ?').bind(entryId).run()

      const response = await admin.get(SEARCH_ENDPOINT)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: SearchItem[] }>()
      expect(body.items.find(candidate => candidate.id === entryId)?.author_name).toBeNull()
    })
  })
})
