// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Stats slice — media endpoints, integration tier.
 * Covers the media-library and unused-media reports against a tracked-upload count
 * larger than any single repository scan, through real D1.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface MediaItem {
  key: string
  size_bytes: number
  mime_type: string
}

// One more than the old fixed scan window, so the oldest upload sits outside it.
const TRACKED_UPLOADS = 1001
const INSERT_CHUNK = 100
const OLDEST_KEY = 'media/file-0.png'
const TRACKED_SIZE_BYTES = 10

describe('stats slice — media endpoints (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  async function referenceFromDraft(key: string): Promise<void> {
    const created = await admin.post('/api/content/posts', { title: 'Draft owner' })
    if (created.status !== 201) throw new Error(`content create returned ${created.status}: ${await created.text()}`)
    const { id } = await created.json<{ id: string }>()
    const draft = await admin.put(`/api/content/posts/${id}/draft`, { image: `http://localhost/api/media/${key}` })
    if (draft.status !== 200) throw new Error(`draft save returned ${draft.status}: ${await draft.text()}`)
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await harness.db.prepare('DELETE FROM media_objects').run()
    for (let chunkStart = 0; chunkStart < TRACKED_UPLOADS; chunkStart += INSERT_CHUNK) {
      const chunkEnd = Math.min(chunkStart + INSERT_CHUNK, TRACKED_UPLOADS)
      await harness.db.batch(Array.from({ length: chunkEnd - chunkStart }, (_, offset) => {
        const index = chunkStart + offset
        return harness.db.prepare(
          'INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(`media/file-${index}.png`, `file-${index}.png`, 'image/png', TRACKED_SIZE_BYTES, CANONICAL_USERS.admin.id, index + 1)
      }))
    }
  })

  describe('GET /api/content/stats/media-library', () => {
    it('reports every tracked upload in the total and serves the oldest one past offset 1000', async () => {
      const response = await admin.get('/api/content/stats/media-library?offset=1000&limit=12')

      expect(response.status).toBe(200)
      const body = await response.json<{ items: MediaItem[]; total: number }>()
      expect(body.total).toBe(TRACKED_UPLOADS)
      expect(body.items.map(item => item.key)).toEqual([OLDEST_KEY])
      const persisted = await harness.db.prepare('SELECT COUNT(*) AS total FROM media_objects').first<{ total: number }>()
      expect(persisted?.total).toBe(TRACKED_UPLOADS)
    })

    it('keeps the tracked metadata of a referenced upload outside the first 1000 rows', async () => {
      await referenceFromDraft(OLDEST_KEY)

      const response = await admin.get('/api/content/stats/media-library?offset=1000&limit=12')

      expect(response.status).toBe(200)
      const body = await response.json<{ items: MediaItem[]; total: number }>()
      // A reconstructed entry would carry size 0 and a MIME guessed from the extension.
      expect(body.total).toBe(TRACKED_UPLOADS)
      expect(body.items).toHaveLength(1)
      expect(body.items[0]).toMatchObject({ key: OLDEST_KEY, size_bytes: TRACKED_SIZE_BYTES, mime_type: 'image/png' })
    })
  })

  describe('GET /api/content/stats/unused-media', () => {
    it('lists the unreferenced upload beyond the first 1000 tracked rows', async () => {
      const response = await admin.get('/api/content/stats/unused-media')

      expect(response.status).toBe(200)
      const body = await response.json<{ items: MediaItem[] }>()
      expect(body.items).toHaveLength(TRACKED_UPLOADS)
      expect(body.items.map(item => item.key)).toContain(OLDEST_KEY)
    })
  })
})
