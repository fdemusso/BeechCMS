import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../src/factory'
import { TEST_ENV, TEST_USERS, TEST_SEEDS } from './fixtures'
import { MockD1Database } from './mocks/mock-d1-database'
import { JoseTokenService } from '../src/auth/jose-token-service'

/**
 * MOCK: S3 CLIENT (Cloudflare R2)
 * Since upload.ts uses the AWS S3 SDK directly, we must mock the client and its commands
 * to ensure deterministic tests without real network calls.
 */
const mockS3Send = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: vi.fn((args) => args),
  GetObjectCommand: vi.fn((args) => args),
  DeleteObjectCommand: vi.fn((args) => args),
  HeadObjectCommand: vi.fn((args) => args),
}))

/**
 * SPRINT: BeechCMS Test Redesign
 * FLOW: Media & Assets (R2)
 * 
 * This suite verifies the full lifecycle of media assets:
 * 1. Uploading files (images/PDFs) with validation and tracking.
 * 2. Serving files from R2 through the API proxy.
 * 3. Deleting files and ensuring metadata/stats cleanup.
 */
describe('Flow: Media & Assets', () => {
  let db: MockD1Database
  let app: ReturnType<typeof createBeechApp>
  let adminToken: string

  /**
   * Setup: Initialize a clean environment for each test.
   * Includes a mock database, a fresh app instance, and a valid admin JWT.
   */
  beforeEach(async () => {
    vi.clearAllMocks()
    db = new MockD1Database({ users: TEST_USERS })
    app = createBeechApp({ seeds: TEST_SEEDS })
    
    // Generate a valid admin token for protected upload/delete routes
    const tokenService = new JoseTokenService(TEST_ENV.JWT_SECRET, {})
    adminToken = await tokenService.issue({ sub: TEST_USERS[0].id, email: TEST_USERS[0].email })

    mockS3Send.mockReset()
  })

  /**
   * TEST: POST /api/upload
   * Validates file upload logic, including size limits, MIME restrictions, and database tracking.
   */
  describe('POST /api/upload', () => {
    
    /**
     * @description success: upload a valid image file
     * @input Valid Multipart FormData with 'file' field
     * @output 200 OK with the public URL of the uploaded asset
     */
    it('success: valid image upload updates database and returns URL', async () => {
      mockS3Send.mockResolvedValue({})
      
      const formData = new FormData()
      // Simulate a small PNG file
      const fileBlob = new Blob(['fake-image-binary-data'], { type: 'image/png' })
      formData.append('file', fileBlob, 'logo.png')

      const res = await app.request('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      const body = await res.json<{ url: string }>()
      
      // Verify response structure
      expect(body.url).toContain('/api/media/')
      
      // Verify R2 interaction
      expect(mockS3Send).toHaveBeenCalled()
      
      // Verify D1 Tracking (Media Library)
      expect(db.mediaObjects.length).toBe(1)
      expect(db.mediaObjects[0].filename).toBe('logo.png')
      expect(db.mediaObjects[0].mime_type).toBe('image/png')
      
      // Verify System Stats (Storage counter)
      expect(db.systemStats['total_storage_bytes']).toBe(fileBlob.size)
    })

    /**
     * @description error: attempt upload without authentication
     * @input Multipart FormData without Authorization header
     * @output 401 Unauthorized
     */
    it('error: unauthorized access returns 401', async () => {
      const res = await app.request('/api/upload', {
        method: 'POST',
        body: new FormData()
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(401)
    })

    /**
     * @description error: upload an unsupported file type (.exe)
     * @input Multipart FormData with 'file' field of type application/x-msdownload
     * @output 400 Bad Request
     */
    it('error: invalid MIME type returns 400', async () => {
      const formData = new FormData()
      formData.append('file', new Blob(['binary'], { type: 'application/x-msdownload' }), 'virus.exe')

      const res = await app.request('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toContain('type not allowed')
    })

    /**
     * @description error: upload a file exceeding the 5MB limit
     * @input Multipart FormData with a 6MB file
     * @output 400 Bad Request
     */
    it('error: file too large returns 400', async () => {
      const bigContent = new Uint8Array(6 * 1024 * 1024) // 6MB
      const formData = new FormData()
      formData.append('file', new Blob([bigContent], { type: 'image/png' }), 'giant.png')

      const res = await app.request('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(400)
      const body = await res.json<{ error: string }>()
      expect(body.error).toContain('large')
    })

    it('tracking: each upload creates a separate media_objects record with a unique key', async () => {
      mockS3Send.mockResolvedValue({})

      const upload = (name: string) => {
        const fd = new FormData()
        fd.append('file', new Blob(['content'], { type: 'image/png' }), name)
        return app.request('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` },
          body: fd,
        }, { ...TEST_ENV, DB: db as any })
      }

      const r1 = await upload('photo-a.png')
      const r2 = await upload('photo-b.png')

      expect(r1.status).toBe(200)
      expect(r2.status).toBe(200)

      // Both uploads must be tracked in D1
      expect(db.mediaObjects).toHaveLength(2)
      // Keys must differ (UUID-based naming)
      expect(db.mediaObjects[0].key).not.toBe(db.mediaObjects[1].key)
      // S3 PutObject called once per file — no skips, no double-calls
      expect(mockS3Send).toHaveBeenCalledTimes(2)
    })
  })

  /**
   * TEST: GET /api/media/:key
   * Validates the media proxy that serves files from R2 to the public.
   */
  describe('GET /api/media/:key', () => {
    
    /**
     * @description success: retrieve an existing file
     * @input Valid object key
     * @output 200 OK with correct Content-Type and binary body
     */
    it('success: serves file from R2 with correct headers', async () => {
      const bodyStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        }
      })
      
      mockS3Send.mockResolvedValue({
        Body: bodyStream,
        ContentType: 'image/png'
      })

      const res = await app.request('/api/media/test-key.png', {
        method: 'GET'
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/png')
      expect(res.headers.get('Cache-Control')).toContain('public, max-age=31536000')
    })

    /**
     * @description error: request a non-existent key
     * @input Invalid/Missing object key
     * @output 404 Not Found
     */
    it('error: non-existent file returns 404', async () => {
      mockS3Send.mockRejectedValue(new Error('NoSuchKey'))

      const res = await app.request('/api/media/ghost-file.jpg', {
        method: 'GET'
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(404)
    })

    it('error: R2 access denied returns 500', async () => {
      const err = new Error('AccessDenied')
      ;(err as any).name = 'AccessDenied'
      mockS3Send.mockRejectedValue(err)

      const res = await app.request('/api/media/restricted-key.jpg', {
        method: 'GET'
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(500)
    })
  })

  /**
   * TEST: DELETE /api/upload/:key
   * Validates asset removal and cleanup logic.
   */
  describe('DELETE /api/upload/:key', () => {
    
    /**
     * @description success: delete an asset and clean up metadata
     * @input Valid object key in URL parameter
     * @output 200 OK and cleanup of D1 records
     */
    it('success: deletes from R2 and updates D1 stats', async () => {
      // Setup: "upload" a file first by populating mock D1
      const key = '12345-test.png'
      const fileSize = 1024
      db.mediaObjects.push({ key, filename: 'test.png', mime_type: 'image/png', size_bytes: fileSize, uploaded_by: 'admin' })
      db.systemStats['total_storage_bytes'] = fileSize

      // Mock S3 DeleteObject (size comes from D1, no HEAD needed)
      mockS3Send.mockResolvedValueOnce({}) // DeleteObject response

      const res = await app.request(`/api/upload/${key}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      
      // Verify D1 Cleanup
      expect(db.mediaObjects.length).toBe(0)
      expect(db.systemStats['total_storage_bytes']).toBe(0)
      
      // Verify R2 deletion was called
      expect(mockS3Send).toHaveBeenCalledTimes(1) // Delete only (size from D1)
    })
  })
})
