// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Upload slice — proxied multipart fallback gate, integration tier.
 * Real D1 and real R2 (Miniflare): in production the Worker must never receive upload bytes, so
 * POST /api/upload is refused before the body is parsed; outside production it stays the dev fallback.
 */

import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const bucket = (env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET

async function adminFor(environment: string) {
  __resetSeedRegistryCache()
  const harness = await createTestHarness({
    db: env.DB,
    env: { ENV: environment, MEDIA_BUCKET: bucket },
    createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
  })
  await env.DB.prepare('DELETE FROM media_objects').run()
  return harness.asUser('admin')
}

function multipartUpload(name: string) {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(16).fill(1)], name, { type: 'image/png' }))
  return { method: 'POST', body: form }
}

const storedKeys = async () => (await bucket.list()).objects.map((object) => object.key)

const mediaRows = async () =>
  (await env.DB.prepare('SELECT COUNT(*) AS total FROM media_objects').first<{ total: number }>())?.total

describe('upload slice — proxied multipart fallback gate (real D1 + R2)', () => {
  describe('POST /api/upload', () => {
    it('in production refuses with 501 presigned_urls_required and stores nothing', async () => {
      const admin = await adminFor('production')
      const keysBefore = await storedKeys()

      const response = await admin.request('/api/upload', multipartUpload('prod-fallback.png'))

      expect(response.status).toBe(501)
      expect((await response.json<{ error: string }>()).error).toBe('presigned_urls_required')
      expect(await storedKeys()).toEqual(keysBefore)
      expect(await mediaRows()).toBe(0)
    })

    it('outside production still accepts the multipart upload and registers it', async () => {
      const admin = await adminFor('development')

      const response = await admin.request('/api/upload', multipartUpload('dev-fallback.png'))

      expect(response.status).toBe(200)
      const { key } = await response.json<{ key: string }>()
      expect(await storedKeys()).toContain(key)
      expect(await mediaRows()).toBe(1)
    })
  })
})
