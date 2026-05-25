import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../src/factory'
import { TEST_ENV, TEST_USERS, TEST_SEEDS } from './fixtures'
import { MockD1Database } from './mocks/mock-d1-database'
import { JoseTokenService } from '../src/auth/jose-token-service'
import { SystemClock } from '@beechcms/core'

const { mockS3Send, mockGetSignedUrl } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: vi.fn((args) => args),
  GetObjectCommand: vi.fn((args) => args),
  DeleteObjectCommand: vi.fn((args) => args),
  HeadObjectCommand: vi.fn((args) => args),
  ListObjectsV2Command: vi.fn((args) => args),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}))

describe('Flow: Media & Assets (presigned URLs)', () => {
  let db: MockD1Database
  let app: ReturnType<typeof createBeechApp>
  let adminToken: string

  beforeEach(async () => {
    vi.clearAllMocks()
    db = new MockD1Database({ users: TEST_USERS })
    app = createBeechApp({ seeds: TEST_SEEDS })

    const tokenService = new JoseTokenService(TEST_ENV.JWT_SECRET, {}, SystemClock)
    adminToken = await tokenService.issue({ sub: TEST_USERS[0].id, email: TEST_USERS[0].email })

    mockS3Send.mockReset()
    mockGetSignedUrl.mockReset()
  })

  describe('POST /api/upload/presign', () => {
    it('returns 401 without JWT', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(401)
    })

    it('returns 400 when filename is missing', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: 'image/png', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(400)
    })

    it('returns 400 when mimeType is missing', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(400)
    })

    it('returns 400 when sizeBytes is zero', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 0 }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(400)
    })

    it('returns 400 when sizeBytes is not a number', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 'big' }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(400)
    })

    it('returns 400 for disallowed MIME type', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'virus.exe', mimeType: 'application/x-msdownload', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toContain('not allowed')
    })

    it('returns 400 when sizeBytes exceeds MAX_UPLOAD_BYTES', async () => {
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'huge.png', mimeType: 'image/png', sizeBytes: 60 * 1024 * 1024 }),
      }, { ...TEST_ENV, MAX_UPLOAD_BYTES: String(50 * 1024 * 1024), DB: db as any })
      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toContain('too large')
    })

    it('happy path: returns uploadUrl, key, expiresIn', async () => {
      mockGetSignedUrl.mockResolvedValue('https://r2.example.com/presigned?X-Amz-Signature=abc')
      const res = await app.request('/api/upload/presign', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'photo.png', mimeType: 'image/png', sizeBytes: 1024 }),
      }, { ...TEST_ENV, DB: db as any })
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
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(401)
    })

    it('returns 404 when object does not exist in storage', async () => {
      mockS3Send.mockRejectedValue(Object.assign(new Error('NotFound'), { name: 'NotFound' }))
      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '12345-ghost.png' }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(404)
    })

    it('happy path: tracks upload and returns URL', async () => {
      mockS3Send.mockResolvedValue({ ContentLength: 2048, ContentType: 'image/png' })
      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '12345-photo.png' }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(200)
      const body = await res.json<{ url: string }>()
      expect(body.url).toContain('photo.png')
      expect(db.mediaObjects).toHaveLength(1)
      expect(db.mediaObjects[0].key).toBe('12345-photo.png')
      expect(db.systemStats['total_storage_bytes']).toBe(2048)
    })

    it('idempotent: second confirm does not duplicate tracking', async () => {
      const key = '12345-photo.png'
      db.mediaObjects.push({ key, filename: 'photo.png', mime_type: 'image/png', size_bytes: 1024, uploaded_by: 'user-1' })
      db.systemStats['total_storage_bytes'] = 1024

      const res = await app.request('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(200)
      expect(db.mediaObjects).toHaveLength(1)
      expect(db.systemStats['total_storage_bytes']).toBe(1024)
      expect(mockS3Send).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/upload/download-url/:key', () => {
    it('returns 404 when key does not exist', async () => {
      mockS3Send.mockRejectedValue(Object.assign(new Error('NotFound'), { name: 'NotFound' }))
      const res = await app.request('/api/upload/download-url/ghost.png', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(404)
    })

    it('happy path: returns downloadUrl and expiresIn', async () => {
      mockS3Send.mockResolvedValue({ ContentLength: 1024, ContentType: 'image/png' })
      mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-get?X-Amz-Signature=xyz')
      const res = await app.request('/api/upload/download-url/12345-photo.png', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(200)
      const body = await res.json<{ downloadUrl: string; expiresIn: number }>()
      expect(body.downloadUrl).toContain('X-Amz-Signature')
      expect(body.expiresIn).toBe(900)
    })
  })

  describe('GET /api/media/:key', () => {
    it('serves file from storage with correct headers', async () => {
      const bodyStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        }
      })
      mockS3Send.mockResolvedValue({ Body: bodyStream, ContentType: 'image/png' })
      const res = await app.request('/api/media/test-key.png', {
        method: 'GET',
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/png')
      expect(res.headers.get('Cache-Control')).toContain('public, max-age=31536000')
    })

    it('returns 404 for non-existent file', async () => {
      mockS3Send.mockRejectedValue(new Error('NoSuchKey'))
      const res = await app.request('/api/media/ghost-file.jpg', {
        method: 'GET',
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/upload/:key', () => {
    it('deletes from storage and updates D1 stats', async () => {
      const key = '12345-test.png'
      const fileSize = 1024
      db.mediaObjects.push({ key, filename: 'test.png', mime_type: 'image/png', size_bytes: fileSize, uploaded_by: 'admin' })
      db.systemStats['total_storage_bytes'] = fileSize
      mockS3Send.mockResolvedValueOnce({})
      const res = await app.request(`/api/upload/${key}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db as any })
      expect(res.status).toBe(200)
      expect(db.mediaObjects).toHaveLength(0)
      expect(db.systemStats['total_storage_bytes']).toBe(0)
    })
  })
})
