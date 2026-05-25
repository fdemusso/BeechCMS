import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { TEST_ENV, TEST_USERS, TEST_SEEDS } from './fixtures'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { JoseTokenService } from '../src/auth/jose-token-service'
import { SystemClock } from '@beechcms/core'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'http://localhost:9000',
  credentials: { accessKeyId: 'beechdev', secretAccessKey: 'beechdevsecret' },
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
      expect(body.key).toMatch(/^\d+-photo\.png$/)
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
  })

  describe('GET /api/upload/download-url/:key', () => {
    it('returns 404 when key does not exist', async () => {
      const res = await app.request(`/api/upload/download-url/${Date.now()}-ghost.png`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/upload/:key', () => {
    it('deletes from storage and removes DB record', async () => {
      const key = `${Date.now()}-delete-me.png`
      const fileSize = 1024

      await db.prepare('INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)').bind(key, 'delete-me.png', 'image/png', fileSize, TEST_USERS[0].id).run()
      await db.prepare("UPDATE system_stats SET value = ? WHERE id = 'total_storage_bytes'").bind(String(fileSize)).run()

      // Pre-upload the file to MinIO so HeadObjectCommand succeeds
      const presignRes = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: key, mimeType: 'image/png', sizeBytes: 3 }),
      }, { ...TEST_ENV, DB: db })
      const { uploadUrl } = await presignRes.json<{ uploadUrl: string }>()
      await fetch(uploadUrl, { method: 'PUT', body: new Uint8Array([1, 2, 3]), headers: { 'Content-Type': 'image/png' } })

      const res = await app.request(`/api/upload/${key}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)

      const mediaObj = await db.prepare('SELECT * FROM media_objects WHERE key = ?').bind(key).first()
      expect(mediaObj).toBeNull()
    })
  })
})
