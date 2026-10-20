// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Upload slice — direct-upload confirmation, integration tier.
 * Real D1 and real R2 (Miniflare): the confirm route must register an object and count its bytes
 * exactly once, however many confirmations race for the same key.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const OBJECT_BYTES = new Uint8Array(100).fill(7)
const OBJECT_KEY = '1700000000000-abc123-photo.png'

describe('upload slice — confirm integration (real D1 + R2)', () => {
  let harness: TestHarness
  let admin: TestClient
  const bucket = (env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      env: { MEDIA_BUCKET: bucket },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await env.DB.prepare("UPDATE system_stats SET value = '0' WHERE id = 'total_storage_bytes'").run()
    await env.DB.prepare('DELETE FROM media_objects').run()
    await bucket.put(OBJECT_KEY, OBJECT_BYTES, { httpMetadata: { contentType: 'image/png' } })
  })

  const confirm = () => admin.request('/api/upload/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: OBJECT_KEY }),
  })

  const storageBytes = async () =>
    Number((await env.DB.prepare("SELECT value FROM system_stats WHERE id = 'total_storage_bytes'").first<{ value: string }>())?.value)

  const mediaRows = async () =>
    (await env.DB.prepare('SELECT COUNT(*) AS total FROM media_objects WHERE key = ?').bind(OBJECT_KEY).first<{ total: number }>())?.total

  describe('POST /api/upload/confirm', () => {
    it('registers the object once and counts its bytes once', async () => {
      const response = await confirm()

      expect(response.status).toBe(200)
      expect(await mediaRows()).toBe(1)
      expect(await storageBytes()).toBe(OBJECT_BYTES.byteLength)
    })

    it('repeated sequential confirmations leave storage counted once', async () => {
      await confirm()
      const second = await confirm()

      expect(second.status).toBe(200)
      expect(await storageBytes()).toBe(OBJECT_BYTES.byteLength)
    })

    it('concurrent confirmations all succeed and count the bytes exactly once', async () => {
      const responses = await Promise.all([confirm(), confirm(), confirm()])

      expect(responses.map((r) => r.status)).toEqual([200, 200, 200])
      expect(await mediaRows()).toBe(1)
      expect(await storageBytes()).toBe(OBJECT_BYTES.byteLength)
    })
  })
})
