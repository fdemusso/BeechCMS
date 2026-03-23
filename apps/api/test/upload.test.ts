/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockJwtVerify = vi.hoisted(() => vi.fn())
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    jwtVerify: mockJwtVerify,
  }
})

const mockS3Send = vi.hoisted(() => vi.fn())
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}))

import app from '../src/index'

const JWT_SECRET = 'test-secret-key'
const R2_ENV = {
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
  R2_BUCKET_NAME: 'test-bucket',
}

/** Mock D1 minimo (richiesto da Bindings) */
function createMockD1() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}), first: vi.fn().mockResolvedValue(null), all: vi.fn().mockResolvedValue({ results: [] }) })),
    })),
  }
}

function getTestEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: createMockD1(),
    JWT_SECRET,
    ...R2_ENV,
    ...overrides,
  }
}

describe('API Upload - POST /api/upload', () => {
  beforeEach(() => {
    mockJwtVerify.mockReset()
    mockS3Send.mockReset()
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@test.com' },
      protectedHeader: { alg: 'HS256', typ: 'JWT' },
    })
    mockS3Send.mockResolvedValue({})
  })

  it('senza Authorization -> 401', async () => {
    const formData = new FormData()
    formData.append('file', new File(['x'], 'test.png', { type: 'image/png' }))

    const res = await app.request('/api/upload', {
      method: 'POST',
      body: formData,
    }, getTestEnv())

    expect(res.status).toBe(401)
    const data = await res.json() as { error?: string }
    expect(data.error).toBe('Unauthorized')
  })

  it('Content-Type non multipart -> 400', async () => {
    const res = await app.request('/api/upload', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, getTestEnv())

    expect(res.status).toBe(400)
    const data = await res.json() as { error?: string }
    expect(data.error).toContain('multipart')
  })

  it('FormData senza campo file -> 400', async () => {
    const formData = new FormData()
    formData.append('other', 'value')

    const res = await app.request('/api/upload', {
      method: 'POST',
      body: formData,
      headers: { Authorization: 'Bearer valid-token' },
    }, getTestEnv())

    expect(res.status).toBe(400)
    const data = await res.json() as { error?: string }
    expect(data.error).toContain('file')
  })

  it('file con MIME non consentito -> 400', async () => {
    const formData = new FormData()
    formData.append('file', new File(['x'], 'test.txt', { type: 'text/plain' }))

    const res = await app.request('/api/upload', {
      method: 'POST',
      body: formData,
      headers: { Authorization: 'Bearer valid-token' },
    }, getTestEnv())

    expect(res.status).toBe(400)
    const data = await res.json() as { error?: string }
    expect(data.error).toContain('not allowed')
  })

  it('file > 5MB -> 400', async () => {
    const bigContent = new Uint8Array(5 * 1024 * 1024 + 1)
    const formData = new FormData()
    formData.append('file', new File([bigContent], 'big.png', { type: 'image/png' }))

    const res = await app.request('/api/upload', {
      method: 'POST',
      body: formData,
      headers: { Authorization: 'Bearer valid-token' },
    }, getTestEnv())

    expect(res.status).toBe(400)
    const data = await res.json() as { error?: string }
    expect(data.error).toContain('large')
  })

  it('R2 non configurato -> 500', async () => {
    const formData = new FormData()
    formData.append('file', new File(['x'], 'test.png', { type: 'image/png' }))

    const res = await app.request('/api/upload', {
      method: 'POST',
      body: formData,
      headers: { Authorization: 'Bearer valid-token' },
    }, getTestEnv({ R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_ENDPOINT: undefined, R2_BUCKET_NAME: undefined }))

    expect(res.status).toBe(500)
    const data = await res.json() as { error?: string }
    expect(data.error).toContain('R2')
  })

  it('successo -> 200 con url', async () => {
    const formData = new FormData()
    formData.append('file', new File(['x'], 'test.png', { type: 'image/png' }))

    const res = await app.request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
      headers: { Authorization: 'Bearer valid-token' },
    }, getTestEnv())

    expect(res.status).toBe(200)
    const data = await res.json() as { url?: string }
    expect(data.url).toBeDefined()
    expect(data.url).toContain('/api/media/')
    expect(mockS3Send).toHaveBeenCalled()
  })
})

describe('API Media - GET /api/media/:key', () => {
  beforeEach(() => {
    mockS3Send.mockReset()
  })

  it('R2 non configurato -> 500', async () => {
    const res = await app.request('/api/media/test-key', {
      method: 'GET',
    }, getTestEnv({ R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_ENDPOINT: undefined, R2_BUCKET_NAME: undefined }))

    expect(res.status).toBe(500)
    const data = await res.json() as { error?: string }
    expect(data.error).toContain('R2')
  })

  it('oggetto non trovato -> 404', async () => {
    mockS3Send.mockRejectedValue(new Error('NoSuchKey'))

    const res = await app.request('/api/media/nonexistent-key', {
      method: 'GET',
    }, getTestEnv())

    expect(res.status).toBe(404)
    const data = await res.json() as { error?: string }
    expect(data.error).toBe('Not found')
  })

  it('successo -> 200 con Content-Type e Cache-Control', async () => {
    const bodyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0x89, 0x50, 0x4e]))
        controller.close()
      },
    })
    mockS3Send.mockResolvedValue({
      Body: bodyStream,
      ContentType: 'image/png',
    })

    const res = await app.request('/api/media/123-test.png', {
      method: 'GET',
    }, getTestEnv())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(mockS3Send).toHaveBeenCalled()
  })
})
