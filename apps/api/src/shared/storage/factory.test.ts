// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBucketProvider, NullBucket, resetNullBucketWarning } from './factory'
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
      expect.stringContaining('To configure local storage, set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and R2_BUCKET_NAME in .dev.vars or run MinIO.')
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

  it('securely handles objects with prototype pollution keys without false config match', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Object with prototype properties
    const maliciousEnv = Object.create({
      R2_ACCESS_KEY_ID: 'inherited-key',
      R2_SECRET_ACCESS_KEY: 'inherited-secret',
      R2_ENDPOINT: 'http://localhost:9000',
      R2_BUCKET_NAME: 'inherited-bucket',
      constructor: () => {},
      toString: () => 'polluted',
    })

    maliciousEnv.ENV = 'development'

    const provider = createBucketProvider(maliciousEnv as Env, 'http://localhost:8787')
    expect(provider).toBeInstanceOf(NullBucket)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
  })

  it('throws 503 HTTPException on NullBucket operations', async () => {
    const nullBucket = new NullBucket()

    expect(() => nullBucket.put()).toThrow()
    expect(() => nullBucket.get()).toThrow()
    expect(() => nullBucket.delete()).toThrow()
    expect(() => nullBucket.head()).toThrow()
    expect(() => nullBucket.getUrl()).toThrow()
    expect(() => nullBucket.getTotalSize()).toThrow()
    expect(() => nullBucket.list()).toThrow()
    expect(() => nullBucket.presignPut()).toThrow()
    expect(() => nullBucket.presignGet()).toThrow()

    try {
      nullBucket.put()
    } catch (err: any) {
      expect(err.status).toBe(503)
      const responseBody = await err.res.json()
      expect(responseBody.error).toBe('storage_not_configured')
      expect(responseBody.message).toBe('Storage is not configured. Please set R2 credentials or run MinIO.')
    }
  })
})
