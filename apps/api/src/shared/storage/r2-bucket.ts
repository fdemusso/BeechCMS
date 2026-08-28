// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { BeechBucket, PutBucketOptions, GetBucketResult, PresignOptions } from '@beechcms/core'
import { HTTPException } from 'hono/http-exception'

/**
 * Implementation of BeechBucket using Cloudflare Workers native R2Bucket binding.
 * Used when running inside Cloudflare Workers with an `r2_buckets` binding (e.g. MEDIA_BUCKET).
 */
export class R2BucketAdapter implements BeechBucket {
  private bucket: R2Bucket
  private baseUrl: string
  private cdnUrl: string | null

  constructor(bucket: R2Bucket, baseUrl: string, cdnUrl?: string) {
    this.bucket = bucket
    this.baseUrl = baseUrl
    this.cdnUrl = cdnUrl ?? null
  }

  async put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream, options?: PutBucketOptions): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
      customMetadata: options?.metadata,
    })
  }

  async get(key: string): Promise<GetBucketResult | null> {
    const object = await this.bucket.get(key)
    if (!object) return null

    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType,
      size: object.size,
      metadata: object.customMetadata,
    }
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key)
  }

  async head(key: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null> {
    const object = await this.bucket.head(key)
    if (!object) return null

    return {
      size: object.size,
      contentType: object.httpMetadata?.contentType,
      metadata: object.customMetadata,
    }
  }

  getUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/')
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${encodedKey}`
    }
    return `${this.baseUrl}/api/media/${encodedKey}`
  }

  async getTotalSize(): Promise<number> {
    let total = 0
    let cursor: string | undefined
    do {
      const listed = await this.bucket.list({ cursor })
      for (const obj of listed.objects) {
        total += obj.size
      }
      cursor = listed.truncated ? (listed as { cursor: string }).cursor : undefined
    } while (cursor)
    return total
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> {
    const listed = await this.bucket.list({
      prefix: options?.prefix,
      limit: options?.limit,
      cursor: options?.cursor,
    })
    return {
      objects: (listed.objects ?? []).map((obj) => ({
        key: obj.key,
        size: obj.size,
      })),
      cursor: listed.truncated ? (listed as { cursor: string }).cursor : undefined,
    }
  }

  async presignPut(_key: string, _options: PresignOptions): Promise<string> {
    throw new HTTPException(501, {
      res: new Response(
        JSON.stringify({
          error: 'not_implemented',
          message: 'Presigned URLs are not supported with native R2Bucket binding. Configure S3 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME) for presigned upload URLs.',
        }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    })
  }

  async presignGet(_key: string, _options: PresignOptions): Promise<string> {
    throw new HTTPException(501, {
      res: new Response(
        JSON.stringify({
          error: 'not_implemented',
          message: 'Presigned URLs are not supported with native R2Bucket binding. Configure S3 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME) for presigned download URLs.',
        }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    })
  }
}
