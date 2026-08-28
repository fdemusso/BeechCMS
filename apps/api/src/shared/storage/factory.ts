// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { BeechBucket, PutBucketOptions, GetBucketResult } from '@beechcms/core'
import { Env } from '../../types'
import { S3Bucket } from './s3-bucket'
import { R2BucketAdapter } from './r2-bucket'

import { HTTPException } from 'hono/http-exception'

export { R2BucketAdapter } from './r2-bucket'

export class NullBucket implements BeechBucket {
  private fail(): never {
    throw new HTTPException(503, {
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
  put(): Promise<void> { return this.fail() }
  get(): Promise<GetBucketResult | null> { return this.fail() }
  delete(): Promise<void> { return this.fail() }
  head(): Promise<{ size: number } | null> { return this.fail() }
  getUrl(): string { return this.fail() }
  getTotalSize(): Promise<number> { return this.fail() }
  list(): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> { return this.fail() }
  presignPut(): Promise<string> { return this.fail() }
  presignGet(): Promise<string> { return this.fail() }
}

let hasWarnedNullBucket = false
let hasWarnedMediaBucketOnly = false

/** Reset the warning state (useful for test isolation) */
export function resetNullBucketWarning(): void {
  hasWarnedNullBucket = false
  hasWarnedMediaBucketOnly = false
}

/**
 * Single storage path: S3-compatible HTTP API.
 * Prod → Cloudflare R2 with S3 API token.
 * Dev  → MinIO container (or R2 staging bucket).
 */
export function createBucketProvider(env: Env, baseUrl: string): BeechBucket {
  const hasR2Id = Object.hasOwn(env, 'R2_ACCESS_KEY_ID') && typeof env.R2_ACCESS_KEY_ID === 'string' && env.R2_ACCESS_KEY_ID.length > 0
  const hasR2Secret = Object.hasOwn(env, 'R2_SECRET_ACCESS_KEY') && typeof env.R2_SECRET_ACCESS_KEY === 'string' && env.R2_SECRET_ACCESS_KEY.length > 0
  const hasR2Endpoint = Object.hasOwn(env, 'R2_ENDPOINT') && typeof env.R2_ENDPOINT === 'string' && env.R2_ENDPOINT.length > 0
  const hasR2Bucket = Object.hasOwn(env, 'R2_BUCKET_NAME') && typeof env.R2_BUCKET_NAME === 'string' && env.R2_BUCKET_NAME.length > 0
  const hasMediaBucket = Object.hasOwn(env, 'MEDIA_BUCKET') && env.MEDIA_BUCKET !== null && env.MEDIA_BUCKET !== undefined && typeof env.MEDIA_BUCKET === 'object' && typeof (env.MEDIA_BUCKET as any).get === 'function'

  if (hasR2Id && hasR2Secret && hasR2Endpoint && hasR2Bucket) {
    return new S3Bucket({
      endpoint: env.R2_ENDPOINT!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      bucketName: env.R2_BUCKET_NAME!,
      baseUrl,
      cdnUrl: env.MEDIA_CDN_URL?.trim().replace(/\/$/, '') || undefined,
    })
  }

  if (hasMediaBucket) {
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
      env.MEDIA_CDN_URL?.trim().replace(/\/$/, '') || undefined
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
