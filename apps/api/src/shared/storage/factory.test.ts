// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBucketProvider, NullBucket, R2BucketAdapter, resetNullBucketWarning } from './factory'
import { S3Bucket } from './s3-bucket'
import type { Env } from '../../types'

describe('Storage Factory & NullBucket', () => {
  beforeEach(() => {
    resetNullBucketWarning()
    vi.restoreAllMocks()
  })

  it('creates S3Bucket when all R2 credentials and bucket configs are provided', () => {
    const env: Partial<Env> = {
      R2_ACCESS_KEY_ID: 'test-key',
      R2_SECRET_ACCESS_KEY: 'test-secret',
      R2_ENDPOINT: 'http://localhost:9000',
      R2_BUCKET_NAME: 'test-bucket',
    }

    const provider = createBucketProvider(env as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(S3Bucket)
  })

  it('creates R2BucketAdapter and logs informative note when MEDIA_BUCKET binding is provided without S3 credentials', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const mockR2Bucket: any = {
      get: vi.fn(),
      head: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    }

    const env: Partial<Env> = {
      MEDIA_BUCKET: mockR2Bucket,
    }

    const provider = createBucketProvider(env as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(R2BucketAdapter)
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('ℹ️ [BeechCMS] Native MEDIA_BUCKET binding detected. Media serving is active.')
    )
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Note: Direct uploads via Presigned URLs require R2 S3 credentials')
    )
  })

  it('prefers S3Bucket when both S3 credentials and MEDIA_BUCKET are provided', () => {
    const mockR2Bucket: any = {
      get: vi.fn(),
    }

    const env: Partial<Env> = {
      R2_ACCESS_KEY_ID: 'test-key',
      R2_SECRET_ACCESS_KEY: 'test-secret',
      R2_ENDPOINT: 'http://localhost:9000',
      R2_BUCKET_NAME: 'test-bucket',
      MEDIA_BUCKET: mockR2Bucket,
    }

    const provider = createBucketProvider(env as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(S3Bucket)
  })

  it('falls back to NullBucket and emits console.warn in development mode when unconfigured', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const env: Partial<Env> = {
      ENV: 'development',
    }

    const provider = createBucketProvider(env as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(NullBucket)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('⚠️ [BeechCMS] Storage is not configured. Falling back to NullBucket. Uploads will return 503.')
    )
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('To configure local storage for Presigned uploads, set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and R2_BUCKET_NAME in .dev.vars or run MinIO (pnpm dev:full).')
    )
  })

  it('deduplicates console.warn so multiple createBucketProvider calls do not spam the console in dev', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const env: Partial<Env> = {
      ENV: 'development',
    }

    createBucketProvider(env as Env, 'http://localhost:8787')
    createBucketProvider(env as Env, 'http://localhost:8787')
    createBucketProvider(env as Env, 'http://localhost:8787')

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
  })

  it('does not emit console.warn when ENV is production even if unconfigured', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const env: Partial<Env> = {
      ENV: 'production',
    }

    const provider = createBucketProvider(env as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(NullBucket)
    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })

  it('falls back to NullBucket when credentials contain only whitespace', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const env: Partial<Env> = {
      ENV: 'development',
      R2_ACCESS_KEY_ID: '   ',
      R2_SECRET_ACCESS_KEY: '  ',
      R2_ENDPOINT: '   ',
      R2_BUCKET_NAME: ' ',
    }

    const provider = createBucketProvider(env as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(NullBucket)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
  })

  it('trims whitespace from S3 credentials and endpoint when instantiating S3Bucket', () => {
    const env: Partial<Env> = {
      R2_ACCESS_KEY_ID: '  test-key  ',
      R2_SECRET_ACCESS_KEY: '  test-secret  ',
      R2_ENDPOINT: '  http://localhost:9000  ',
      R2_BUCKET_NAME: '  test-bucket  ',
    }

    const provider = createBucketProvider(env as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(S3Bucket)
  })

  it('securely handles objects with prototype pollution keys without false config match', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Object with prototype properties
    const maliciousEnv = Object.create({
      R2_ACCESS_KEY_ID: 'inherited-key',
      R2_SECRET_ACCESS_KEY: 'inherited-secret',
      R2_ENDPOINT: 'http://localhost:9000',
      R2_BUCKET_NAME: 'inherited-bucket',
      MEDIA_BUCKET: { get: () => {} },
      constructor: () => {},
      toString: () => 'polluted',
    })

    maliciousEnv.ENV = 'development'

    const provider = createBucketProvider(maliciousEnv as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(NullBucket)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
  })

  it('throws 503 HTTPException on NullBucket operations as rejected promises', async () => {
    const nullBucket = new NullBucket()

    await expect(nullBucket.put()).rejects.toThrow()
    await expect(nullBucket.get()).rejects.toThrow()
    await expect(nullBucket.delete()).rejects.toThrow()
    await expect(nullBucket.head()).rejects.toThrow()
    expect(() => nullBucket.getUrl()).toThrow()
    await expect(nullBucket.getTotalSize()).rejects.toThrow()
    await expect(nullBucket.list()).rejects.toThrow()
    await expect(nullBucket.presignPut()).rejects.toThrow()
    await expect(nullBucket.presignGet()).rejects.toThrow()

    // Verify .catch() handler works without synchronous exception crash
    let caughtError: any = null
    await nullBucket.put().catch((err) => {
      caughtError = err
    })
    expect(caughtError).toBeDefined()
    expect(caughtError.status).toBe(503)
    const responseBody = await caughtError.res.json()
    expect(responseBody.error).toBe('storage_not_configured')
    expect(responseBody.message).toContain('Direct uploads require Cloudflare R2 S3 credentials')
  })
})

describe('R2BucketAdapter', () => {
  it('correctly delegates get() when object exists and when object is null', async () => {
    const stream = new ReadableStream()
    const mockR2Bucket: any = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'found.png') {
          return Promise.resolve({
            body: stream,
            size: 1024,
            httpMetadata: { contentType: 'image/png' },
            customMetadata: { tag: 'test' },
          })
        }
        return Promise.resolve(null)
      }),
    }

    const adapter = new R2BucketAdapter(mockR2Bucket, 'http://localhost:8787')

    const result = await adapter.get('found.png')
    expect(result).toEqual({
      body: stream,
      contentType: 'image/png',
      size: 1024,
      metadata: { tag: 'test' },
    })

    const notFound = await adapter.get('missing.png')
    expect(notFound).toBeNull()
  })

  it('correctly delegates head() when object exists and when object is null', async () => {
    const mockR2Bucket: any = {
      head: vi.fn().mockImplementation((key: string) => {
        if (key === 'found.png') {
          return Promise.resolve({
            size: 2048,
            httpMetadata: { contentType: 'image/png' },
            customMetadata: { author: 'beech' },
          })
        }
        return Promise.resolve(null)
      }),
    }

    const adapter = new R2BucketAdapter(mockR2Bucket, 'http://localhost:8787')

    const head = await adapter.head('found.png')
    expect(head).toEqual({
      size: 2048,
      contentType: 'image/png',
      metadata: { author: 'beech' },
    })

    const missingHead = await adapter.head('missing.png')
    expect(missingHead).toBeNull()
  })

  it('correctly delegates put() and delete()', async () => {
    const mockR2Bucket: any = {
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    const adapter = new R2BucketAdapter(mockR2Bucket, 'http://localhost:8787')
    const buffer = new Uint8Array([1, 2, 3])

    await adapter.put('test.jpg', buffer, {
      contentType: 'image/jpeg',
      metadata: { env: 'prod' },
    })

    expect(mockR2Bucket.put).toHaveBeenCalledWith('test.jpg', buffer, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { env: 'prod' },
    })

    await adapter.delete('test.jpg')
    expect(mockR2Bucket.delete).toHaveBeenCalledWith('test.jpg')
  })

  it('correctly delegates put(), get(), delete(), and head() while stripping leading slashes', async () => {
    const mockR2Bucket: any = {
      put: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      head: vi.fn().mockResolvedValue(null),
    }

    const adapter = new R2BucketAdapter(mockR2Bucket, 'http://localhost:8787')
    const buffer = new Uint8Array([1, 2, 3])

    await adapter.put('/test.jpg', buffer, {
      contentType: 'image/jpeg',
      metadata: { env: 'prod' },
    })
    expect(mockR2Bucket.put).toHaveBeenCalledWith('test.jpg', buffer, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { env: 'prod' },
    })

    await adapter.get('//test.jpg')
    expect(mockR2Bucket.get).toHaveBeenCalledWith('test.jpg')

    await adapter.delete('///test.jpg')
    expect(mockR2Bucket.delete).toHaveBeenCalledWith('test.jpg')

    await adapter.head('/test.jpg')
    expect(mockR2Bucket.head).toHaveBeenCalledWith('test.jpg')
  })

  it('generates getUrl with base URL and optional cdnUrl and strips leading slashes and trailing slashes in baseUrl/cdnUrl', () => {
    const mockR2Bucket: any = {}
    const adapterWithoutCdn = new R2BucketAdapter(mockR2Bucket, 'https://api.example.com///')
    expect(adapterWithoutCdn.getUrl('folder/image 1.png')).toBe('https://api.example.com/api/media/folder/image%201.png')
    expect(adapterWithoutCdn.getUrl('/folder/image 1.png')).toBe('https://api.example.com/api/media/folder/image%201.png')
    expect(adapterWithoutCdn.getUrl('///folder/image 1.png')).toBe('https://api.example.com/api/media/folder/image%201.png')

    const adapterWithCdn = new R2BucketAdapter(mockR2Bucket, 'https://api.example.com/', 'https://cdn.example.com///')
    expect(adapterWithCdn.getUrl('folder/image 1.png')).toBe('https://cdn.example.com/folder/image%201.png')
    expect(adapterWithCdn.getUrl('/folder/image 1.png')).toBe('https://cdn.example.com/folder/image%201.png')
  })

  it('calculates getTotalSize by iterating paginated list and handles undefined objects safely', async () => {
    const mockR2Bucket: any = {
      list: vi.fn().mockImplementation(({ cursor }: { cursor?: string }) => {
        if (!cursor) {
          return Promise.resolve({
            objects: [{ size: 100 }, { size: 200 }],
            truncated: true,
            cursor: 'cursor-page-2',
          })
        }
        if (cursor === 'cursor-page-2') {
          return Promise.resolve({
            objects: undefined,
            truncated: true,
            cursor: 'cursor-page-3',
          })
        }
        return Promise.resolve({
          objects: [{ size: 300 }],
          truncated: false,
        })
      }),
    }

    const adapter = new R2BucketAdapter(mockR2Bucket, 'http://localhost:8787')
    const totalSize = await adapter.getTotalSize()

    expect(totalSize).toBe(600)
    expect(mockR2Bucket.list).toHaveBeenCalledTimes(3)
  })

  it('correctly delegates list() with options and cursor pagination', async () => {
    const mockR2Bucket: any = {
      list: vi.fn().mockResolvedValue({
        objects: [{ key: 'file1.jpg', size: 50 }, { key: 'file2.jpg', size: 100 }],
        truncated: true,
        cursor: 'next-page',
      }),
    }

    const adapter = new R2BucketAdapter(mockR2Bucket, 'http://localhost:8787')
    const result = await adapter.list({ prefix: 'uploads/', limit: 10, cursor: 'cur-1' })

    expect(mockR2Bucket.list).toHaveBeenCalledWith({
      prefix: 'uploads/',
      limit: 10,
      cursor: 'cur-1',
    })
    expect(result).toEqual({
      objects: [
        { key: 'file1.jpg', size: 50 },
        { key: 'file2.jpg', size: 100 },
      ],
      cursor: 'next-page',
    })
  })

  it('throws 501 HTTPException on presignPut and presignGet', async () => {
    const mockR2Bucket: any = {}
    const adapter = new R2BucketAdapter(mockR2Bucket, 'http://localhost:8787')

    await expect(adapter.presignPut('file.jpg', { expiresIn: 900 })).rejects.toThrow()
    await expect(adapter.presignGet('file.jpg', { expiresIn: 900 })).rejects.toThrow()

    try {
      await adapter.presignPut('file.jpg', { expiresIn: 900 })
    } catch (err: any) {
      expect(err.status).toBe(501)
      const res = await err.res.json()
      expect(res.error).toBe('presigned_urls_require_s3_credentials')
      expect(res.message).toContain('Direct client upload via Presigned URLs requires Cloudflare R2 S3 API credentials')
    }
  })
})

describe('S3Bucket', () => {
  it('generates getUrl with base URL and optional cdnUrl and strips leading slashes and trailing slashes in baseUrl/cdnUrl', () => {
    const bucket = new S3Bucket({
      endpoint: 'http://localhost:9000',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucketName: 'bucket',
      baseUrl: 'https://api.example.com///',
    })
    expect(bucket.getUrl('folder/image 1.png')).toBe('https://api.example.com/api/media/folder/image%201.png')
    expect(bucket.getUrl('/folder/image 1.png')).toBe('https://api.example.com/api/media/folder/image%201.png')
    expect(bucket.getUrl('///folder/image 1.png')).toBe('https://api.example.com/api/media/folder/image%201.png')

    const bucketWithCdn = new S3Bucket({
      endpoint: 'http://localhost:9000',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucketName: 'bucket',
      baseUrl: 'https://api.example.com/',
      cdnUrl: 'https://cdn.example.com///',
    })
    expect(bucketWithCdn.getUrl('folder/image 1.png')).toBe('https://cdn.example.com/folder/image%201.png')
    expect(bucketWithCdn.getUrl('/folder/image 1.png')).toBe('https://cdn.example.com/folder/image%201.png')
  })

  it('strips leading slashes in put, get, delete, head, presignPut, and presignGet', async () => {
    const bucket = new S3Bucket({
      endpoint: 'http://localhost:9000',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucketName: 'bucket',
      baseUrl: 'https://api.example.com',
    })

    const clientSendSpy = vi.spyOn((bucket as any).client, 'send').mockResolvedValue({})

    await bucket.put('/uploads/photo.jpg', new Uint8Array([1, 2, 3]))
    expect(clientSendSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'bucket',
          Key: 'uploads/photo.jpg',
        }),
      })
    )

    await bucket.get('//uploads/photo.jpg')
    expect(clientSendSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'bucket',
          Key: 'uploads/photo.jpg',
        }),
      })
    )

    await bucket.delete('///uploads/photo.jpg')
    expect(clientSendSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'bucket',
          Key: 'uploads/photo.jpg',
        }),
      })
    )

    await bucket.head('/uploads/photo.jpg')
    expect(clientSendSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: 'bucket',
          Key: 'uploads/photo.jpg',
        }),
      })
    )

    const presignedPutUrl = await bucket.presignPut('/uploads/photo.jpg', { expiresIn: 900 })
    expect(presignedPutUrl).toContain('uploads/photo.jpg')
    expect(presignedPutUrl).not.toContain('//uploads/photo.jpg')

    const presignedGetUrl = await bucket.presignGet('/uploads/photo.jpg', { expiresIn: 900 })
    expect(presignedGetUrl).toContain('uploads/photo.jpg')
    expect(presignedGetUrl).not.toContain('//uploads/photo.jpg')
  })

  it('handles NoSuchKey, NotFound, message NoSuchKey, and HTTP 404 status codes in get and head without throwing', async () => {
    const bucket = new S3Bucket({
      endpoint: 'http://localhost:9000',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucketName: 'bucket',
      baseUrl: 'https://api.example.com',
    })

    const mock404Error = Object.assign(new Error('Not Found'), {
      $metadata: { httpStatusCode: 404 },
    })

    // Mock client.send
    const clientSendSpy = vi.spyOn((bucket as any).client, 'send')

    // 1. get() with 404 httpStatusCode
    clientSendSpy.mockRejectedValueOnce(mock404Error)
    const getResult = await bucket.get('missing.png')
    expect(getResult).toBeNull()

    // 2. head() with 404 httpStatusCode
    clientSendSpy.mockRejectedValueOnce(mock404Error)
    const headResult = await bucket.head('missing.png')
    expect(headResult).toBeNull()

    // 3. get() with errorMessage 'NoSuchKey'
    clientSendSpy.mockRejectedValueOnce(new Error('NoSuchKey'))
    const getResultNoSuchKey = await bucket.get('missing.png')
    expect(getResultNoSuchKey).toBeNull()

    // 4. head() with errorName 'NotFound'
    const notFoundError = new Error('Object not found')
    notFoundError.name = 'NotFound'
    clientSendSpy.mockRejectedValueOnce(notFoundError)
    const headResultNotFound = await bucket.head('missing.png')
    expect(headResultNotFound).toBeNull()

    // 5. Non-404 error should be rethrown
    const accessDeniedError = new Error('Access Denied')
    accessDeniedError.name = 'AccessDenied'
    clientSendSpy.mockRejectedValueOnce(accessDeniedError)
    await expect(bucket.get('private.png')).rejects.toThrow('Access Denied')
  })
})
