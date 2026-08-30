// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { TEST_ENV, TEST_USERS, TEST_SEEDS } from './fixtures'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { JoseTokenService } from '../src/auth/providers/jwt-token.service'
import { SystemClock } from '@beechcms/core'
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
  credentials: {
    accessKeyId: 'beechdev',
    secretAccessKey: 'beechdevsecret',
  },
  forcePathStyle: true,
})

describe('Flow: Media & Assets (presigned URLs)', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let adminToken: string

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: TEST_SEEDS })

    const tokenService = new JoseTokenService(TEST_ENV.JWT_SECRET, {}, SystemClock)
    adminToken = await tokenService.issue({ sub: TEST_USERS[0].id, email: TEST_USERS[0].email })
  })

  describe('POST /api/upload/presign', () => {
    it('returns 401 without JWT', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })

    it('returns 400 when filename is missing', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: 'image/png', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
    })

    it('returns 400 when mimeType is missing', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
    })

    it('returns 400 when sizeBytes is zero', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 0 }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
    })

    it('returns 400 when sizeBytes is not a number', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 'big' }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
    })

    it('returns 400 for disallowed MIME type', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'virus.exe', mimeType: 'application/x-msdownload', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toContain('not allowed')
    })

    it('returns 400 when sizeBytes exceeds MAX_UPLOAD_BYTES', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'huge.png', mimeType: 'image/png', sizeBytes: 60 * 1024 * 1024 }),
      }, { ...TEST_ENV, MAX_UPLOAD_BYTES: String(50 * 1024 * 1024), DB: db })
      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toContain('too large')
    })

    it('happy path: returns uploadUrl, key, expiresIn', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const body = await res.json<{ uploadUrl: string; key: string; expiresIn: number }>()
      expect(body.uploadUrl).toContain('X-Amz-Signature')
      expect(body.key).toMatch(/^\d+-[a-zA-Z0-9]+-photo\.png$/)
      expect(body.expiresIn).toBe(900)
    })
  })

  describe('POST /api/upload/confirm', () => {
    it('returns 401 without JWT', async () => {
      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'some-key.png' }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })

    it('returns 404 when object does not exist in storage', async () => {
      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `${Date.now()}-ghost.png` }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)
    })

    it('happy path: uploads to MinIO, confirms, and tracks in DB', async () => {
      const filename = `${Date.now()}-test-photo.png`

      // 1. Presign — the API generates a storage key from the filename
      const presignRes = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, mimeType: 'image/png', sizeBytes: 3 }),
      }, { ...TEST_ENV, DB: db })
      expect(presignRes.status).toBe(200)
      const { uploadUrl, key } = await presignRes.json<{ uploadUrl: string; key: string }>()

      // 2. Upload to MinIO via presigned URL
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: new Uint8Array([1, 2, 3]),
        headers: { 'Content-Type': 'image/png' },
      })
      expect(putRes.ok).toBe(true)

      // 3. Confirm using the key returned by the presign endpoint
      const confirmRes = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }, { ...TEST_ENV, DB: db })
      expect(confirmRes.status).toBe(200)
      const body = await confirmRes.json<{ url: string }>()
      expect(body.url).toContain(key)

      // 4. Verify object exists in MinIO
      await expect(s3.send(new HeadObjectCommand({ Bucket: TEST_ENV.R2_BUCKET_NAME, Key: key }))).resolves.toBeTruthy()

      // 5. Verify tracked in DB
      const mediaObj = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(key).first<{ key: string; size_bytes: number }>()
      expect(mediaObj).not.toBeNull()
      expect(mediaObj?.key).toBe(key)
    })

    it('idempotent: second confirm does not duplicate tracking', async () => {
      const key = `${Date.now()}-idempotent.png`
      const fileSize = 1024
      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'idempotent.png', 'image/png', fileSize, TEST_USERS[0].id).run()
      await db.prepare("UPDATE system_stats SET value = ? WHERE id = 'total_storage_bytes'").bind(String(fileSize)).run()

      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)

      const count = await db.prepare('SELECT COUNT(*) as n FROM media_objects WHERE key = ?').bind(key).first<{ n: number }>()
      expect(count?.n).toBe(1)
    })

    it('returns 400 when file size exceeds maxBytes limit', async () => {
      const filename = `${Date.now()}-large-photo.png`

      const presignRes = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, mimeType: 'image/png', sizeBytes: 3 }),
      }, { ...TEST_ENV, DB: db })
      expect(presignRes.status).toBe(200)
      const { uploadUrl, key } = await presignRes.json<{ uploadUrl: string; key: string }>()

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: new Uint8Array([1, 2, 3]),
        headers: { 'Content-Type': 'image/png' },
      })
      expect(putRes.ok).toBe(true)

      const confirmRes = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }, { ...TEST_ENV, MAX_UPLOAD_BYTES: '2', DB: db })
      expect(confirmRes.status).toBe(400)

      const body = await confirmRes.json<{ error: string }>()
      expect(body.error).toContain('File too large')

      const mediaObj = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(key).first()
      expect(mediaObj).toBeNull()
    })

    it('returns 400 when key format is invalid', async () => {
      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'system/config.json' }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toBe('Invalid key format')
    })
  })

  describe('GET /api/upload/download-url/:key', () => {
    it('returns 404 when key is not in database', async () => {
      const res = await app.request(`/api/upload/download-url/${Date.now()}-ghost.png`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)
    })

    it('returns 403 when user is not owner and not admin', async () => {
      const key = `${Date.now()}-download-test.png`
      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'download-test.png', 'image/png', 100, TEST_USERS[0].id).run()

      const tokenService = new JoseTokenService(TEST_ENV.JWT_SECRET, {}, SystemClock)
      const editorToken = await tokenService.issue({ sub: TEST_USERS[1].id, email: TEST_USERS[1].email, role: 'editor' })

      const res = await app.request(`/api/upload/download-url/${key}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${editorToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(403)
    })

    it('allows download when user is owner', async () => {
      const key = `${Date.now()}-download-owner.png`
      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'download-owner.png', 'image/png', 100, TEST_USERS[1].id).run()

      const tokenService = new JoseTokenService(TEST_ENV.JWT_SECRET, {}, SystemClock)
      const editorToken = await tokenService.issue({ sub: TEST_USERS[1].id, email: TEST_USERS[1].email, role: 'editor' })

      await s3.send(new PutObjectCommand({
        Bucket: TEST_ENV.R2_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array([1, 2, 3]),
        ContentType: 'image/png'
      }))

      const res = await app.request(`/api/upload/download-url/${key}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${editorToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const body = await res.json<{ downloadUrl: string }>()
      expect(body.downloadUrl).toBeDefined()
    })
  })

  describe('DELETE /api/upload/:key', () => {
    it('deletes from storage and removes DB record', async () => {
      const key = `${Date.now()}-delete-me.png`
      const fileSize = 1024

      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'delete-me.png', 'image/png', fileSize, TEST_USERS[0].id).run()
      await db.prepare("UPDATE system_stats SET value = ? WHERE id = 'total_storage_bytes'").bind(String(fileSize)).run()

      await s3.send(new PutObjectCommand({
        Bucket: TEST_ENV.R2_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array([1, 2, 3]),
        ContentType: 'image/png'
      }))

      const res = await app.request(`/api/upload/${key}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)

      const mediaObj = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(key).first()
      expect(mediaObj).toBeNull()
    })

    it('returns 404 when file is not found in database', async () => {
      const res = await app.request(`/api/upload/nonexistent-key.png`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)
    })

    it('returns 403 when user is not owner and not admin', async () => {
      const key = `${Date.now()}-owner-test.png`
      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'owner-test.png', 'image/png', 100, TEST_USERS[0].id).run()

      const tokenService = new JoseTokenService(TEST_ENV.JWT_SECRET, {}, SystemClock)
      const editorToken = await tokenService.issue({ sub: TEST_USERS[1].id, email: TEST_USERS[1].email, role: 'editor' })

      const res = await app.request(`/api/upload/${key}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${editorToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(403)
    })

    it('allows delete if user is admin even if not owner', async () => {
      const key = `${Date.now()}-admin-delete-test.png`
      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'admin-delete-test.png', 'image/png', 100, TEST_USERS[1].id).run()

      const tokenService = new JoseTokenService(TEST_ENV.JWT_SECRET, {}, SystemClock)
      const adminRoleToken = await tokenService.issue({ sub: TEST_USERS[0].id, email: TEST_USERS[0].email, role: 'admin' })

      await s3.send(new PutObjectCommand({
        Bucket: TEST_ENV.R2_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array([1, 2, 3]),
        ContentType: 'image/png'
      }))

      const res = await app.request(`/api/upload/${key}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminRoleToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
    })

    it('sanitizes relative paths and non-standard characters from key before deletion', async () => {
      const key = `${Date.now()}-traversal.png`
      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'traversal.png', 'image/png', 100, TEST_USERS[0].id).run()

      await s3.send(new PutObjectCommand({
        Bucket: TEST_ENV.R2_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array([1, 2, 3]),
        ContentType: 'image/png'
      }))

      const res = await app.request(`/api/upload/..%2F..%2F${key}!@%23`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)

      const mediaObj = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(key).first()
      expect(mediaObj).toBeNull()
    })
  })

  describe('GET /api/media/:key with native MEDIA_BUCKET binding (issue #307)', () => {
    it('serves media from native MEDIA_BUCKET binding when S3 credentials are not set', async () => {
      const mockStorage = new Map<string, { body: Uint8Array; contentType: string }>()
      mockStorage.set('photos/cat.webp', {
        body: new TextEncoder().encode('webp-binary-content'),
        contentType: 'image/webp',
      })

      const mockMediaBucket: any = {
        get: async (key: string) => {
          const item = mockStorage.get(key)
          if (!item) return null
          return {
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(item.body)
                controller.close()
              },
            }),
            size: item.body.byteLength,
            httpMetadata: { contentType: item.contentType },
          }
        },
      }

      const envWithoutS3 = {
        DB: db,
        JWT_SECRET: TEST_ENV.JWT_SECRET,
        MEDIA_BUCKET: mockMediaBucket,
      }

      const res = await app.request('/api/media/photos/cat.webp', { method: 'GET' }, envWithoutS3 as any)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/webp')
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
      const text = await res.text()
      expect(text).toBe('webp-binary-content')
    })

    it('returns 404 for non-existent key in native MEDIA_BUCKET', async () => {
      const mockMediaBucket: any = {
        get: async () => null,
      }

      const envWithoutS3 = {
        DB: db,
        JWT_SECRET: TEST_ENV.JWT_SECRET,
        MEDIA_BUCKET: mockMediaBucket,
      }

      const res = await app.request('/api/media/non-existent.jpg', { method: 'GET' }, envWithoutS3 as any)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/upload (direct proxied fallback upload)', () => {
    it('returns 401 without JWT', async () => {
      const formData = new FormData()
      formData.append('file', new File(['dummy content'], 'avatar.png', { type: 'image/png' }))

      const res = await app.request('/api/upload', {
        method: 'POST',
        body: formData,
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })

    it('returns 400 when file is missing in form data', async () => {
      const formData = new FormData()
      formData.append('unrelated', 'value')

      const res = await app.request('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData,
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
    })

    it('returns 400 when file type is not allowed', async () => {
      const formData = new FormData()
      formData.append('file', new File(['malicious script'], 'evil.exe', { type: 'application/x-msdownload' }))

      const res = await app.request('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData,
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
    })

    it('successfully uploads file directly via native MEDIA_BUCKET and tracks in DB', async () => {
      const storageMap = new Map<string, { body: ArrayBuffer; options?: any }>()
      const mockMediaBucket: any = {
        put: async (key: string, body: ArrayBuffer, options?: any) => {
          storageMap.set(key, { body, options })
          return {}
        },
        get: async (key: string) => {
          const item = storageMap.get(key)
          if (!item) return null
          return {
            body: item.body,
            size: item.body.byteLength,
            httpMetadata: { contentType: item.options?.httpMetadata?.contentType },
          }
        },
        head: async (key: string) => {
          const item = storageMap.get(key)
          if (!item) return null
          return {
            size: item.body.byteLength,
            httpMetadata: { contentType: item.options?.httpMetadata?.contentType },
          }
        },
        delete: async (key: string) => {
          storageMap.delete(key)
        },
        list: async () => ({ objects: [], truncated: false }),
      }

      const envWithNative = {
        DB: db,
        JWT_SECRET: TEST_ENV.JWT_SECRET,
        MEDIA_BUCKET: mockMediaBucket,
      }

      const fileContent = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
      const formData = new FormData()
      formData.append('file', new File([fileContent], 'photo.png', { type: 'image/png' }))

      const res = await app.request('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData,
      }, envWithNative as any)

      expect(res.status).toBe(200)
      const data = await res.json<any>()
      expect(data.url).toBeDefined()
      expect(data.key).toMatch(/^\d+-[a-zA-Z0-9]+-photo\.png$/)

      // Verify stored in storage
      expect(storageMap.has(data.key)).toBe(true)

      // Verify tracked in DB
      const record = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(data.key).first<any>()
      expect(record).toBeDefined()
      expect(record.filename).toBe('photo.png')
      expect(record.mime_type).toBe('image/png')
      expect(record.size_bytes).toBe(fileContent.byteLength)
    })
  })

  describe('Issue #342: key entropy and collision prevention', () => {
    it('generates distinct keys for concurrent uploads with identical filenames', async () => {
      const presignPromises = Array.from({ length: 5 }, () =>
        app.request('/api/upload/presign', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'avatar.png', mimeType: 'image/png', sizeBytes: 100 }),
        }, { ...TEST_ENV, DB: db })
      )

      const responses = await Promise.all(presignPromises)
      const keys: string[] = []
      for (const res of responses) {
        expect(res.status).toBe(200)
        const body = await res.json<{ key: string }>()
        expect(body.key).toMatch(/^\d+-[a-zA-Z0-9]+-avatar\.png$/)
        keys.push(body.key)
      }

      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(5)
    })
  })

  describe('Issue #343: POST /upload/confirm MIME type validation', () => {
    it('returns 400 when confirmed object has disallowed MIME type in storage', async () => {
      const key = `${Date.now()}-a1b2c3d4-evil.exe`
      await s3.send(new PutObjectCommand({
        Bucket: TEST_ENV.R2_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array([1, 2, 3]),
        ContentType: 'application/x-msdownload',
      }))

      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toBe('File type not allowed')

      const mediaObj = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(key).first()
      expect(mediaObj).toBeNull()
    })
  })

  describe('Issue #344: malformed percent-encoding handling', () => {
    it('returns 400 instead of 500 on POST /upload/confirm with malformed key', async () => {
      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '123-%E0%A4%A' }),
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toBe('Invalid key format')
    })

    it('returns 400 instead of 500 on GET /upload/download-url/:key with malformed key', async () => {
      const res = await app.request('/api/upload/download-url/%E0%A4%A', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toBe('Invalid key')
    })

    it('returns 400 instead of 500 on DELETE /upload/:key with malformed key', async () => {
      const res = await app.request('/api/upload/%E0%A4%A', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toBe('Invalid key')
    })

    it('returns 400 on GET /api/media/:key with malformed key', async () => {
      const res = await app.request('/api/media/%E0%A4%A', {
        method: 'GET',
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(400)
    })
  })

  describe('Issue #345: DELETE /upload/:key with URL-encoded characters', () => {
    it('successfully deletes media whose key contains encoded spaces and special characters', async () => {
      const key = `${Date.now()}-a1b2c3d4-my_file.png`
      const fileSize = 512

      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'my_file.png', 'image/png', fileSize, TEST_USERS[0].id).run()
      await db.prepare("UPDATE system_stats SET value = ? WHERE id = 'total_storage_bytes'").bind(String(fileSize)).run()

      await s3.send(new PutObjectCommand({
        Bucket: TEST_ENV.R2_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array([1, 2, 3]),
        ContentType: 'image/png'
      }))

      const encodedKey = key.replace(/_/g, '%5F').replace(/\./g, '%2E')
      const res = await app.request(`/api/upload/${encodedKey}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)

      const mediaObj = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(key).first()
      expect(mediaObj).toBeNull()
    })
  })

  describe('Issue #346: path traversal stripping and Content-Disposition filename', () => {
    it('sanitizes nested path traversal sequences in DELETE /upload/:key', async () => {
      const key = `${Date.now()}-a1b2c3d4-nested.png`
      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'nested.png', 'image/png', 100, TEST_USERS[0].id).run()

      await s3.send(new PutObjectCommand({
        Bucket: TEST_ENV.R2_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array([1, 2, 3]),
        ContentType: 'image/png'
      }))

      // Nested traversal pattern: ....//....//
      const nestedTraversal = `....//....//${key}`
      const res = await app.request(`/api/upload/${encodeURIComponent(nestedTraversal)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const mediaObj = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(key).first()
      expect(mediaObj).toBeNull()
    })

    it('sets Content-Disposition with original filename for active MIME types in media serving', async () => {
      const mockStorage = new Map<string, { body: Uint8Array; contentType: string }>()
      const key = '1700000000-a1b2c3d4-vector_graphic.svg'
      mockStorage.set(key, {
        body: new TextEncoder().encode('<svg></svg>'),
        contentType: 'image/svg+xml',
      })

      const mockMediaBucket: any = {
        get: async (k: string) => {
          const item = mockStorage.get(k)
          if (!item) return null
          return {
            body: item.body,
            size: item.body.byteLength,
            httpMetadata: { contentType: item.contentType },
          }
        },
      }

      const envWithoutS3 = {
        DB: db,
        JWT_SECRET: TEST_ENV.JWT_SECRET,
        MEDIA_BUCKET: mockMediaBucket,
      }

      const res = await app.request(`/api/media/${key}`, { method: 'GET' }, envWithoutS3 as any)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream')
      expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="vector_graphic.svg"')
    })
  })

  describe('Security: prototype pollution and reserved prototype property safety', () => {
    it('safely rejects reserved prototype properties without throwing unhandled errors', async () => {
      const reservedKeys = ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']

      for (const key of reservedKeys) {
        // 1. Confirm endpoint
        const confirmRes = await app.request('/api/upload/confirm', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        }, { ...TEST_ENV, DB: db })
        expect(confirmRes.status).toBe(400)

        // 2. Download URL endpoint
        const downloadRes = await app.request(`/api/upload/download-url/${key}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${adminToken}` },
        }, { ...TEST_ENV, DB: db })
        expect([400, 404]).toContain(downloadRes.status)

        // 3. Delete endpoint
        const deleteRes = await app.request(`/api/upload/${key}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${adminToken}` },
        }, { ...TEST_ENV, DB: db })
        expect([400, 404]).toContain(deleteRes.status)

        // 4. Media serve endpoint
        const mediaRes = await app.request(`/api/media/${key}`, {
          method: 'GET',
        }, { ...TEST_ENV, DB: db })
        expect([400, 404]).toContain(mediaRes.status)
      }
    })
  })
})

