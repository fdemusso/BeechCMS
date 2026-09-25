// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Upload slice — media delivery, integration tier.
 * Real R2 (Miniflare) and no IMAGES binding: covers validation, the non-raster refusal and the
 * passthrough contract. The transforming branch is covered in the unit tier (media-transform.test.ts).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const PNG_1X1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const PDF_MINIMAL = new TextEncoder().encode('%PDF-1.4\n%%EOF\n')

describe('upload slice — media delivery integration (real R2, no IMAGES binding)', () => {
  let harness: TestHarness
  let admin: TestClient
  let visitor: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      // The media route reads through BeechBucket; the r2Buckets binding in vitest.workers.config.ts
      // provisions a real (simulated) one for this tier.
      env: { MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    visitor = harness.anonymous()
  })

  async function upload(bytes: Uint8Array, name: string, type: string): Promise<string> {
    const form = new FormData()
    form.set('file', new File([bytes], name, { type }))
    const response = await admin.request('/api/upload', { method: 'POST', body: form })
    expect(response.status).toBe(200)
    const { key } = await response.json<{ key: string }>()
    return key
  }

  describe('GET /api/media/:key', () => {
    it('without transform parameters serves the original immutably', async () => {
      const key = await upload(PNG_1X1, 'photo.png', 'image/png')

      const response = await visitor.get(`/api/media/${key}`)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('image/png')
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
      expect(response.headers.get('X-Beech-Media-Transform')).toBeNull()
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_1X1)
    })

    it('a valid preset without the IMAGES binding passes the original through uncached', async () => {
      // VETO correction 2: an immutable passthrough would pin the untransformed original under
      // the variant URL in every browser that saw it before the IMAGES binding was enabled.
      const key = await upload(PNG_1X1, 'photo.png', 'image/png')

      const response = await visitor.get(`/api/media/${key}?preset=card&format=webp`)

      expect(response.status).toBe(200)
      expect(response.headers.get('X-Beech-Media-Transform')).toBe('passthrough-unsupported')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Content-Type')).toBe('image/png')
      expect(response.headers.get('ETag')).toBeNull()
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_1X1)
    })

    it('an unknown preset is refused with media_preset_unknown', async () => {
      const key = await upload(PNG_1X1, 'photo.png', 'image/png')

      const response = await visitor.get(`/api/media/${key}?preset=nope`)

      expect(response.status).toBe(400)
    })

    it('a discarded free-form parameter is refused with media_param_forbidden', async () => {
      const key = await upload(PNG_1X1, 'photo.png', 'image/png')

      const response = await visitor.get(`/api/media/${key}?w=800&h=600`)

      expect(response.status).toBe(400)
    })

    it('a PDF requested with a preset is refused with media_not_transformable', async () => {
      const key = await upload(PDF_MINIMAL, 'doc.pdf', 'application/pdf')

      const response = await visitor.get(`/api/media/${key}?preset=card`)

      expect(response.status).toBe(400)
    })

    it('a preset on a key that does not exist is 404', async () => {
      const response = await visitor.get('/api/media/1717000000-deadbeef-missing.png?preset=card')

      expect(response.status).toBe(404)
    })
  })
})
