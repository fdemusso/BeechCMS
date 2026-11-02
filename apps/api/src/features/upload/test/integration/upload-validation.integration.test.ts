// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Upload slice — request validation, integration tier.
 * Real D1 and real R2 (Miniflare): what a malformed body is answered with, and that a refused
 * request stores nothing. The presign happy path needs S3 credentials and stays in the forks tier
 * (apps/api/test/flow/flow-media-assets.test.ts).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const bucket = (env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET

async function adminFor(environment: string): Promise<TestClient> {
  __resetSeedRegistryCache()
  const harness = await createTestHarness({
    db: env.DB,
    env: { ENV: environment, MEDIA_BUCKET: bucket },
    createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
  })
  await env.DB.prepare('DELETE FROM media_objects').run()
  return harness.asUser('admin')
}

function jsonBody(raw: string) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw }
}

function multipart(parts: Record<string, string | File>) {
  const form = new FormData()
  for (const [name, value] of Object.entries(parts)) form.set(name, value)
  return { method: 'POST', body: form }
}

const storedKeys = async () => (await bucket.list()).objects.map((object) => object.key)

const mediaRows = async () =>
  (await env.DB.prepare('SELECT COUNT(*) AS total FROM media_objects').first<{ total: number }>())?.total

describe('upload slice — request validation (real D1 + R2)', () => {
  let admin: TestClient

  beforeEach(async () => {
    admin = await adminFor('development')
  })

  describe('POST /api/upload/presign', () => {
    it('answers a body that is not JSON with 400 Invalid JSON body', async () => {
      const response = await admin.request('/api/upload/presign', jsonBody('{"filename":'))

      expect(response.status).toBe(400)
      expect((await response.json<{ error: string }>()).error).toBe('Invalid JSON body')
    })

    it('answers a null body with 400, where it used to crash into a 500', async () => {
      const response = await admin.request('/api/upload/presign', jsonBody('null'))

      expect(response.status).toBe(400)
      expect((await response.json<{ error: string }>()).error).toBe('filename is required')
    })

    it('names the first rule a body breaks and stores nothing', async () => {
      const valid = { filename: 'photo.png', mimeType: 'image/png', sizeBytes: 1024 }
      const keysBefore = await storedKeys()
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ ...valid, purpose: 'media', filename: '' }, 'Invalid purpose'],
        [{ ...valid, filename: '', mimeType: '' }, 'filename is required'],
        [{ ...valid, mimeType: '', sizeBytes: 0 }, 'mimeType is required'],
        [{ ...valid, sizeBytes: 'big' }, 'sizeBytes must be a positive number'],
      ]

      for (const [body, message] of cases) {
        const response = await admin.request('/api/upload/presign', jsonBody(JSON.stringify(body)))
        expect(response.status).toBe(400)
        expect((await response.json<{ error: string }>()).error).toBe(message)
      }

      expect(await storedKeys()).toEqual(keysBefore)
      expect(await mediaRows()).toBe(0)
    })

    it('checks the size and the type of a well-formed body after its shape', async () => {
      const tooLarge = { filename: 'huge.png', mimeType: 'image/png', sizeBytes: 600 * 1024 * 1024 }
      const forbidden = { filename: 'virus.exe', mimeType: 'application/x-msdownload', sizeBytes: 1024 }

      const large = await admin.request('/api/upload/presign', jsonBody(JSON.stringify(tooLarge)))
      const notAllowed = await admin.request('/api/upload/presign', jsonBody(JSON.stringify(forbidden)))

      expect(large.status).toBe(400)
      expect((await large.json<{ error: string }>()).error).toContain('too large')
      expect(notAllowed.status).toBe(400)
      expect((await notAllowed.json<{ error: string }>()).error).toBe('File type not allowed')
    })
  })

  describe('POST /api/upload/confirm', () => {
    it('answers a body that is not JSON with 400 Invalid JSON body', async () => {
      const response = await admin.request('/api/upload/confirm', jsonBody('not json'))

      expect(response.status).toBe(400)
      expect((await response.json<{ error: string }>()).error).toBe('Invalid JSON body')
    })

    it('answers a missing, blank, non-string or null key with 400 key is required', async () => {
      const bodies = ['{}', '{"key":""}', '{"key":"  "}', '{"key":3}', 'null']

      for (const raw of bodies) {
        const response = await admin.request('/api/upload/confirm', jsonBody(raw))
        expect(response.status).toBe(400)
        expect((await response.json<{ error: string }>()).error).toBe('key is required')
      }

      expect(await mediaRows()).toBe(0)
    })
  })

  describe('POST /api/upload', () => {
    it('answers a body that is not multipart with 400 Invalid multipart form data', async () => {
      const response = await admin.request('/api/upload', jsonBody('{"file":"x"}'))

      expect(response.status).toBe(400)
      expect((await response.json<{ error: string }>()).error).toBe('Invalid multipart form data')
    })

    it('answers a multipart body whose file part is plain text with 400 file is required', async () => {
      const keysBefore = await storedKeys()

      const response = await admin.request('/api/upload', multipart({ file: 'not a file' }))

      expect(response.status).toBe(400)
      expect((await response.json<{ error: string }>()).error).toBe('file is required')
      expect(await storedKeys()).toEqual(keysBefore)
      expect(await mediaRows()).toBe(0)
    })

    it('answers an empty file with 400 File is empty', async () => {
      const keysBefore = await storedKeys()

      const response = await admin.request('/api/upload', multipart({ file: new File([], 'empty.png', { type: 'image/png' }) }))

      expect(response.status).toBe(400)
      expect((await response.json<{ error: string }>()).error).toBe('File is empty')
      expect(await storedKeys()).toEqual(keysBefore)
      expect(await mediaRows()).toBe(0)
    })

    it('in production refuses a body that is not multipart with 501 before reading it', async () => {
      const production = await adminFor('production')

      const response = await production.request('/api/upload', jsonBody('{"file":"x"}'))

      // Regression guard: the gate must run ahead of the form parser, or a production Worker would
      // answer 400 here and would have read the upload body to get there.
      expect(response.status).toBe(501)
      expect((await response.json<{ error: string }>()).error).toBe('presigned_urls_required')
    })
  })
})
