// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface StorageBody {
  fileCount: number
  orphanTotal: number
  orphanBytes: number
  orphanOffset: number
  orphanLimit: number
  orphans: Array<{ key: string }>
}

const ORPHAN_KEY = 'reviewed-orphan.png'
const DRAFT_KEY = 'draft-only.png'

describe('settings slice — storage (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  async function trackMedia(key: string, sizeBytes: number): Promise<void> {
    await env.MEDIA_BUCKET.put(key, 'x'.repeat(sizeBytes))
    await harness.db.prepare(
      'INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(key, key, 'image/png', sizeBytes, CANONICAL_USERS.admin.id, 100).run()
  }

  async function referenceFromDraft(key: string): Promise<void> {
    const created = await admin.post('/api/content/posts', { title: 'Draft owner' })
    if (created.status !== 201) throw new Error(`content create returned ${created.status}: ${await created.text()}`)
    const { id } = await created.json<{ id: string }>()
    const draft = await admin.put(`/api/content/posts/${id}/draft`, { image: `http://localhost/api/media/${key}` })
    if (draft.status !== 200) throw new Error(`draft save returned ${draft.status}: ${await draft.text()}`)
  }

  async function countTracked(keys: string[]): Promise<number> {
    const row = await harness.db.prepare(
      `SELECT COUNT(*) AS total FROM media_objects WHERE key IN (${keys.map(() => '?').join(', ')})`
    ).bind(...keys).first<{ total: number }>()
    return row?.total ?? 0
  }

  async function storageCounter(): Promise<number> {
    const row = await harness.db.prepare("SELECT value FROM system_stats WHERE id = 'total_storage_bytes'").first<{ value: string }>()
    return Number(row?.value)
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      env: { MEDIA_BUCKET: env.MEDIA_BUCKET },
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await harness.db.prepare('DELETE FROM media_objects').run()
    await env.MEDIA_BUCKET.delete([ORPHAN_KEY, DRAFT_KEY])
    await harness.db.prepare("UPDATE system_stats SET value = '1000' WHERE id = 'total_storage_bytes'").run()
    // The 51st upload lies beyond the old fixed 50-row scan.
    for (let index = 0; index < 51; index++) {
      await harness.db.prepare(
        'INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(`media/file-${index}.png`, `file-${index}.png`, 'image/png', 10, CANONICAL_USERS.admin.id, index).run()
    }
  })

  describe('GET /api/settings/storage', () => {
    it('counts orphaned files beyond the first 50 tracked uploads', async () => {
      const response = await admin.get('/api/settings/storage')

      expect(response.status).toBe(200)
      const body = await response.json<StorageBody>()
      expect(body.fileCount).toBe(51)
      expect(body.orphanTotal).toBe(51)
      expect(body.orphanBytes).toBe(510)
      expect(body.orphanOffset).toBe(0)
      expect(body.orphanLimit).toBe(50)
      expect(body.orphans).toHaveLength(50)
    })

    it('returns the older orphan on the next page', async () => {
      const response = await admin.get('/api/settings/storage?offset=50')

      expect(response.status).toBe(200)
      const body = await response.json<StorageBody>()
      expect(body.orphanTotal).toBe(51)
      expect(body.orphans.map(file => file.key)).toEqual(['media/file-0.png'])
      const persisted = await harness.db.prepare('SELECT COUNT(*) AS total FROM media_objects').first<{ total: number }>()
      expect(persisted?.total).toBe(51)
    })

    it('finds an older orphan after more than one repository scan batch', async () => {
      await harness.db.batch(Array.from({ length: 150 }, (_, index) => {
        const fileIndex = index + 51
        return harness.db.prepare(
          'INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(`media/file-${fileIndex}.png`, `file-${fileIndex}.png`, 'image/png', 10, CANONICAL_USERS.admin.id, fileIndex)
      }))

      const response = await admin.get('/api/settings/storage?offset=200')

      expect(response.status).toBe(200)
      const body = await response.json<StorageBody>()
      expect(body.orphanTotal).toBe(201)
      expect(body.orphans.map(file => file.key)).toEqual(['media/file-0.png'])
      const persisted = await harness.db.prepare('SELECT COUNT(*) AS total FROM media_objects').first<{ total: number }>()
      expect(persisted?.total).toBe(201)
    })

    it('excludes a file referenced only by a post draft from the orphans', async () => {
      await trackMedia(DRAFT_KEY, 7)
      await referenceFromDraft(DRAFT_KEY)

      const response = await admin.get('/api/settings/storage')

      expect(response.status).toBe(200)
      const body = await response.json<StorageBody>()
      // A draft-only reference is still a reference: listing it would offer it for deletion.
      expect(body.orphanTotal).toBe(51)
      expect(body.orphans.map(file => file.key)).not.toContain(DRAFT_KEY)
    })

    it('rejects invalid pagination with a machine-readable error', async () => {
      const response = await admin.get('/api/settings/storage?offset=-1')

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('settings-storage-invalid-pagination')
    })
  })

  describe('POST /api/settings/storage/orphans/delete', () => {
    it('deletes a reviewed orphan from R2 and the media registry and decrements the storage counter', async () => {
      await trackMedia(ORPHAN_KEY, 12)

      const response = await admin.post('/api/settings/storage/orphans/delete', { keys: [ORPHAN_KEY] })

      expect(response.status).toBe(200)
      const body = await response.json<{ deleted: string[]; totalBytes: number; fileCount: number }>()
      expect(body).toEqual({ deleted: [ORPHAN_KEY], totalBytes: 988, fileCount: 51 })
      expect(await env.MEDIA_BUCKET.head(ORPHAN_KEY)).toBeNull()
      expect(await countTracked([ORPHAN_KEY])).toBe(0)
      expect(await storageCounter()).toBe(988)
    })

    it('refuses the whole selection when a key gained a draft reference after review', async () => {
      await trackMedia(ORPHAN_KEY, 12)
      await trackMedia(DRAFT_KEY, 7)
      await referenceFromDraft(DRAFT_KEY)

      const response = await admin.post('/api/settings/storage/orphans/delete', { keys: [ORPHAN_KEY, DRAFT_KEY] })

      expect(response.status).toBe(409)
      const body = await response.json<{ type: string; keys: string[] }>()
      expect(body).toEqual({ type: 'settings-storage-orphan-referenced', keys: [DRAFT_KEY] })
      expect(await env.MEDIA_BUCKET.head(ORPHAN_KEY)).not.toBeNull()
      expect(await env.MEDIA_BUCKET.head(DRAFT_KEY)).not.toBeNull()
      expect(await countTracked([ORPHAN_KEY, DRAFT_KEY])).toBe(2)
      expect(await storageCounter()).toBe(1000)
    })

    it('refuses a key that is not tracked media without deleting the rest of the selection', async () => {
      await trackMedia(ORPHAN_KEY, 12)

      const response = await admin.post('/api/settings/storage/orphans/delete', { keys: [ORPHAN_KEY, 'untracked.png'] })

      expect(response.status).toBe(404)
      const body = await response.json<{ type: string; keys: string[] }>()
      expect(body).toEqual({ type: 'settings-storage-orphan-not-found', keys: ['untracked.png'] })
      expect(await env.MEDIA_BUCKET.head(ORPHAN_KEY)).not.toBeNull()
      expect(await countTracked([ORPHAN_KEY])).toBe(1)
      expect(await storageCounter()).toBe(1000)
    })

    it("refuses another user's orphan to a non-admin holder of global content:delete", async () => {
      // Same owner-or-admin rule as DELETE /api/upload/:key; the RBAC gate alone admits this editor.
      await harness.db.prepare(
        `INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
         SELECT 'ura_storage_editor', ?, r.id, '*' FROM roles r WHERE r.name = ?`
      ).bind(CANONICAL_USERS.editor.id, SUPER_ADMIN_ROLE_NAME).run()
      await trackMedia(ORPHAN_KEY, 12)
      const editor = await harness.asUser('editor')

      const response = await editor.post('/api/settings/storage/orphans/delete', { keys: [ORPHAN_KEY] })

      expect(response.status).toBe(403)
      const body = await response.json<{ type: string; keys: string[] }>()
      expect(body).toEqual({ type: 'settings-storage-orphan-forbidden', keys: [ORPHAN_KEY] })
      expect(await env.MEDIA_BUCKET.head(ORPHAN_KEY)).not.toBeNull()
      expect(await countTracked([ORPHAN_KEY])).toBe(1)
    })

    it('rejects a selection that is missing, empty, duplicated, oversized or not a list of key strings', async () => {
      const baselineKeys = Array.from({ length: 51 }, (_, index) => `media/file-${index}.png`)
      const invalidBodies: unknown[] = [
        {},
        { keys: [] },
        { keys: ['media/file-0.png', 'media/file-0.png'] },
        { keys: [42] },
        { keys: [''] },
        // One orphan report page (50) is the largest selection a reviewer can make at once.
        { keys: baselineKeys },
      ]

      for (const invalidBody of invalidBodies) {
        const response = await admin.post('/api/settings/storage/orphans/delete', invalidBody)
        expect(response.status).toBe(400)
        expect((await response.json<{ type: string }>()).type).toBe('settings-storage-invalid-orphan-keys')
      }
      expect(await countTracked(baselineKeys)).toBe(51)
    })
  })
})
