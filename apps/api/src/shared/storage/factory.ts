// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { BeechBucket, PutBucketOptions, GetBucketResult } from '@beechcms/core'
import { Env } from '../../types'
import { S3Bucket } from './s3-bucket'

import { HTTPException } from 'hono/http-exception'

class NullBucket implements BeechBucket {
  private fail(): never {
    throw new HTTPException(503, {
      res: new Response(
        JSON.stringify({ 
          error: 'storage_not_configured',
          message: 'Storage is not configured. Please set R2 credentials or run MinIO.'
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

/**
 * Single storage path: S3-compatible HTTP API.
 * Prod → Cloudflare R2 with S3 API token.
 * Dev  → MinIO container (or R2 staging bucket).
 */
export function createBucketProvider(env: Env, baseUrl: string): BeechBucket {
  if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && env.R2_BUCKET_NAME) {
    return new S3Bucket({
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName: env.R2_BUCKET_NAME,
      baseUrl,
      cdnUrl: env.MEDIA_CDN_URL?.trim().replace(/\/$/, '') || undefined,
    })
  }
  return new NullBucket()
}
