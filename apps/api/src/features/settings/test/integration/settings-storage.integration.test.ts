// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
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

describe('settings slice — storage (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await harness.db.prepare('DELETE FROM media_objects').run()
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

    it('rejects invalid pagination with a machine-readable error', async () => {
      const response = await admin.get('/api/settings/storage?offset=-1')

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('settings-storage-invalid-pagination')
    })
  })
})
