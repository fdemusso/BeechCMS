// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { BeechBucket, PutBucketOptions, GetBucketResult, PresignOptions } from '@beechcms/core'
import { Env } from '../../types'
import { S3Bucket } from './s3-bucket'
import { R2BucketAdapter } from './r2-bucket'
import { HTTPException } from 'hono/http-exception'

export { R2BucketAdapter } from './r2-bucket'

/**
 * Fallback implementation of {@link BeechBucket} used when storage is not configured.
 *
 * @remarks
 * Every bucket operation unconditionally throws an HTTP 503 Service Unavailable exception
 * with error code `storage_not_configured`, providing diagnostic instructions on how to
 * configure Cloudflare R2 credentials or MinIO for local development.
 */
export class NullBucket implements BeechBucket {
  /**
   * Creates an HTTP 503 exception explaining that storage is not configured.
   */
  private createException(): HTTPException {
    return new HTTPException(503, {
      res: new Response(
        JSON.stringify({ 
          error: 'storage_not_configured',
          message: 'Storage is not configured. Direct uploads require Cloudflare R2 S3 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME) in .dev.vars (dev) or wrangler secrets (production). For local testing, run MinIO (pnpm dev:full). Guide: https://developers.cloudflare.com/r2/api/s3/tokens/'
        }),
        { 
          status: 503, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    })
  }

  /**
   * @throws {HTTPException} Always returns a rejected promise with 503 Service Unavailable.
   */
  async put(_key?: string, _body?: ArrayBuffer | Uint8Array | ReadableStream, _options?: PutBucketOptions): Promise<void> {
    throw this.createException()
  }

  /**
   * @throws {HTTPException} Always returns a rejected promise with 503 Service Unavailable.
   */
  async get(_key?: string): Promise<GetBucketResult | null> {
    throw this.createException()
  }

  /**
   * @throws {HTTPException} Always returns a rejected promise with 503 Service Unavailable.
   */
  async delete(_key?: string): Promise<void> {
    throw this.createException()
  }

  /**
   * @throws {HTTPException} Always returns a rejected promise with 503 Service Unavailable.
   */
  async head(_key?: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null> {
    throw this.createException()
  }

  /**
   * @throws {HTTPException} Always throws 503 Service Unavailable.
   */
  getUrl(_key?: string): string {
    throw this.createException()
  }

  /**
   * @throws {HTTPException} Always returns a rejected promise with 503 Service Unavailable.
   */
  async getTotalSize(): Promise<number> {
    throw this.createException()
  }

  /**
   * @throws {HTTPException} Always returns a rejected promise with 503 Service Unavailable.
   */
  async list(_options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> {
    throw this.createException()
  }

  /**
   * @throws {HTTPException} Always returns a rejected promise with 503 Service Unavailable.
   */
  async presignPut(_key?: string, _options?: PresignOptions): Promise<string> {
    throw this.createException()
  }

  /**
   * @throws {HTTPException} Always returns a rejected promise with 503 Service Unavailable.
   */
  async presignGet(_key?: string, _options?: PresignOptions): Promise<string> {
    throw this.createException()
  }
}

/** Flag indicating whether the unconfigured storage warning has already been logged in development. */
let hasWarnedNullBucket = false

/** Flag indicating whether the native MEDIA_BUCKET binding note has already been logged. */
let hasWarnedMediaBucketOnly = false

/**
 * Resets the warning flags for storage provider configuration.
 *
 * @remarks
 * Useful for test isolation to ensure diagnostic warnings are verified reliably across test suites.
 */
export function resetNullBucketWarning(): void {
  hasWarnedNullBucket = false
  hasWarnedMediaBucketOnly = false
}

/**
 * Creates and configures the appropriate {@link BeechBucket} storage provider based on environment settings.
 *
 * @remarks
 * Selection precedence:
 * 1. **S3Bucket**: Used when all R2 S3 credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`) are set.
 * 2. **R2BucketAdapter**: Used when the native Cloudflare Worker `MEDIA_BUCKET` binding is detected (with a notice that presigned uploads require S3 credentials).
 * 3. **NullBucket**: Fallback when no storage is configured. Logs a warning in `development` mode.
 *
 * @param env - Application environment configuration.
 * @param baseUrl - Base URL of the API server used for constructing fallback media URLs.
 * @returns An initialized {@link BeechBucket} provider instance.
 */
export function createBucketProvider(env: Env, baseUrl: string): BeechBucket {
  const hasR2AccessKeyId = Object.hasOwn(env, 'R2_ACCESS_KEY_ID') && typeof env.R2_ACCESS_KEY_ID === 'string' && env.R2_ACCESS_KEY_ID.trim().length > 0
  const hasR2SecretAccessKey = Object.hasOwn(env, 'R2_SECRET_ACCESS_KEY') && typeof env.R2_SECRET_ACCESS_KEY === 'string' && env.R2_SECRET_ACCESS_KEY.trim().length > 0
  const hasR2Endpoint = Object.hasOwn(env, 'R2_ENDPOINT') && typeof env.R2_ENDPOINT === 'string' && env.R2_ENDPOINT.trim().length > 0
  const hasR2BucketName = Object.hasOwn(env, 'R2_BUCKET_NAME') && typeof env.R2_BUCKET_NAME === 'string' && env.R2_BUCKET_NAME.trim().length > 0
  const hasMediaBucketBinding = Object.hasOwn(env, 'MEDIA_BUCKET') && env.MEDIA_BUCKET !== null && env.MEDIA_BUCKET !== undefined && typeof env.MEDIA_BUCKET === 'object' && typeof (env.MEDIA_BUCKET as { get?: unknown }).get === 'function'

  if (hasR2AccessKeyId && hasR2SecretAccessKey && hasR2Endpoint && hasR2BucketName) {
    return new S3Bucket({
      endpoint: env.R2_ENDPOINT!.trim(),
      accessKeyId: env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(),
      bucketName: env.R2_BUCKET_NAME!.trim(),
      baseUrl,
      cdnUrl: env.MEDIA_CDN_URL?.trim().replace(/\/+$/, '') || undefined,
    })
  }

  if (hasMediaBucketBinding) {
    if (!hasWarnedMediaBucketOnly) {
      hasWarnedMediaBucketOnly = true
      console.info(
        'ℹ️ [BeechCMS] Native MEDIA_BUCKET binding detected. Media serving is active.\n' +
        '   Note: Direct uploads via Presigned URLs require R2 S3 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME).\n' +
        '   Configure them in .dev.vars (dev) or via `wrangler secret put` (production). Guide: https://developers.cloudflare.com/r2/api/s3/tokens/'
      )
    }
    return new R2BucketAdapter(
      env.MEDIA_BUCKET!,
      baseUrl,
      env.MEDIA_CDN_URL?.trim().replace(/\/+$/, '') || undefined
    )
  }

  if (env.ENV === 'development' && !hasWarnedNullBucket) {
    hasWarnedNullBucket = true
    console.warn(
      '⚠️ [BeechCMS] Storage is not configured. Falling back to NullBucket. Uploads will return 503.\n' +
      '   To configure local storage for Presigned uploads, set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and R2_BUCKET_NAME in .dev.vars or run MinIO (pnpm dev:full).'
    )
  }

  return new NullBucket()
}

