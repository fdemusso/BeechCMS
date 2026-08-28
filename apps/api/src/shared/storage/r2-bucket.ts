// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { BeechBucket, PutBucketOptions, GetBucketResult, PresignOptions } from '@beechcms/core'
import { HTTPException } from 'hono/http-exception'

/**
 * Implementation of {@link BeechBucket} using Cloudflare Workers' native `R2Bucket` binding.
 *
 * @remarks
 * Used when running inside Cloudflare Workers with an `r2_buckets` binding (e.g. `MEDIA_BUCKET`).
 * Provides direct access to Cloudflare R2 storage without needing external S3 SDK requests.
 *
 * Note: Generating presigned URLs (`presignPut`, `presignGet`) is not supported by native `R2Bucket`
 * bindings and will throw HTTP 501 (`presigned_urls_require_s3_credentials`). Direct client uploads
 * with presigned URLs require S3 credentials configured via {@link S3Bucket}.
 */
export class R2BucketAdapter implements BeechBucket {
  /** Native Cloudflare Workers R2 bucket binding instance. */
  private bucket: R2Bucket
  /** Base URL of the API server used for fallback asset access URLs. */
  private baseUrl: string
  /** Optional custom CDN base URL prepended to media assets when served via CDN. */
  private cdnUrl: string | null

  /**
   * Initializes a new instance of {@link R2BucketAdapter}.
   *
   * @param bucket - The native Cloudflare Workers `R2Bucket` binding.
   * @param baseUrl - Base URL of the API server used to construct fallback media URLs.
   * @param cdnUrl - Optional custom CDN base URL.
   */
  constructor(bucket: R2Bucket, baseUrl: string, cdnUrl?: string) {
    this.bucket = bucket
    this.baseUrl = baseUrl
    this.cdnUrl = cdnUrl ?? null
  }

  /**
   * Uploads an object directly to the native R2 bucket binding.
   *
   * @param key - The unique object key (path) within the bucket.
   * @param body - The object content as an `ArrayBuffer`, `Uint8Array`, or `ReadableStream`.
   * @param options - Optional upload settings such as `contentType` (stored in `httpMetadata`) and custom `metadata`.
   * @throws {Error} If the R2 upload operation fails.
   * @returns A promise that resolves when the upload completes.
   */
  async put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream, options?: PutBucketOptions): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
      customMetadata: options?.metadata,
    })
  }

  /**
   * Retrieves an object from the native R2 bucket.
   *
   * @param key - The unique object key (path) within the bucket.
   * @returns A promise resolving to a {@link GetBucketResult} containing the object's body, metadata, and content type, or `null` if the object does not exist.
   * @throws {Error} If reading from the R2 binding fails.
   */
  async get(key: string): Promise<GetBucketResult | null> {
    const r2Object = await this.bucket.get(key)
    if (!r2Object) return null

    return {
      body: r2Object.body,
      contentType: r2Object.httpMetadata?.contentType,
      size: r2Object.size,
      metadata: r2Object.customMetadata,
    }
  }

  /**
   * Deletes an object from the native R2 bucket.
   *
   * @param key - The unique object key (path) to delete.
   * @throws {Error} If the deletion operation fails.
   * @returns A promise that resolves when the object is deleted.
   */
  async delete(key: string): Promise<void> {
    await this.bucket.delete(key)
  }

  /**
   * Retrieves object metadata from the native R2 bucket without reading the body.
   *
   * @param key - The unique object key (path) within the bucket.
   * @returns A promise resolving to the object's size, content type, and custom metadata, or `null` if the object is not found.
   * @throws {Error} If the head request fails.
   */
  async head(key: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null> {
    const r2HeadObject = await this.bucket.head(key)
    if (!r2HeadObject) return null

    return {
      size: r2HeadObject.size,
      contentType: r2HeadObject.httpMetadata?.contentType,
      metadata: r2HeadObject.customMetadata,
    }
  }

  /**
   * Constructs the public access URL for an object key.
   *
   * @remarks
   * If a CDN URL is configured, returns the CDN-prefixed path (`${cdnUrl}/${encodedKey}`).
   * Otherwise, returns the API fallback path (`${baseUrl}/api/media/${encodedKey}`).
   *
   * @param key - The storage object key.
   * @returns The fully qualified URL to access the media object.
   */
  getUrl(key: string): string {
    const cleanKey = key.replace(/^\/+/, '')
    const encodedKey = cleanKey.split('/').map(encodeURIComponent).join('/')
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${encodedKey}`
    }
    return `${this.baseUrl}/api/media/${encodedKey}`
  }

  /**
   * Computes the cumulative size in bytes of all objects stored in the bucket.
   *
   * @remarks
   * Iterates through all bucket objects using paginated R2 `list` requests.
   *
   * @returns A promise resolving to the total storage size in bytes.
   */
  async getTotalSize(): Promise<number> {
    let totalSizeBytes = 0
    let paginationCursor: string | undefined
    do {
      const listResult = await this.bucket.list({ cursor: paginationCursor })
      for (const objectItem of listResult.objects) {
        totalSizeBytes += objectItem.size
      }
      paginationCursor = listResult.truncated ? (listResult as { cursor: string }).cursor : undefined
    } while (paginationCursor)
    return totalSizeBytes
  }

  /**
   * Lists objects in the R2 bucket matching an optional prefix, with pagination support.
   *
   * @param options - Optional listing parameters including `prefix`, `limit`, and pagination `cursor`.
   * @returns A promise resolving to an array of object summaries (key and size) and an optional continuation cursor.
   */
  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> {
    const listResult = await this.bucket.list({
      prefix: options?.prefix,
      limit: options?.limit,
      cursor: options?.cursor,
    })
    return {
      objects: (listResult.objects ?? []).map((objectItem) => ({
        key: objectItem.key,
        size: objectItem.size,
      })),
      cursor: listResult.truncated ? (listResult as { cursor: string }).cursor : undefined,
    }
  }

  /**
   * Generates a presigned URL for direct upload via HTTP PUT.
   *
   * @remarks
   * Native Cloudflare `R2Bucket` bindings cannot generate cryptographic SigV4 signatures.
   * This method throws an HTTP 501 exception instructing the user to configure S3 API credentials.
   *
   * @param _key - The target object key (path).
   * @param _options - Presigning options.
   * @throws {HTTPException} Always throws 501 Not Implemented because native bindings lack SigV4 signing capability.
   */
  async presignPut(_key: string, _options: PresignOptions): Promise<string> {
    throw new HTTPException(501, {
      res: new Response(
        JSON.stringify({
          error: 'presigned_urls_require_s3_credentials',
          message: 'Direct client upload via Presigned URLs requires Cloudflare R2 S3 API credentials. Native R2Bucket bindings cannot generate cryptographic SigV4 signatures. Please configure R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and R2_BUCKET_NAME via .dev.vars (dev) or `wrangler secret put` (production). Guide: https://developers.cloudflare.com/r2/api/s3/tokens/',
        }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    })
  }

  /**
   * Generates a presigned URL for direct download via HTTP GET.
   *
   * @remarks
   * Native Cloudflare `R2Bucket` bindings cannot generate cryptographic SigV4 signatures.
   * This method throws an HTTP 501 exception instructing the user to configure S3 API credentials.
   *
   * @param _key - The target object key (path).
   * @param _options - Presigning options.
   * @throws {HTTPException} Always throws 501 Not Implemented because native bindings lack SigV4 signing capability.
   */
  async presignGet(_key: string, _options: PresignOptions): Promise<string> {
    throw new HTTPException(501, {
      res: new Response(
        JSON.stringify({
          error: 'presigned_urls_require_s3_credentials',
          message: 'Direct client download via Presigned URLs requires Cloudflare R2 S3 API credentials. Native R2Bucket bindings cannot generate cryptographic SigV4 signatures. Please configure R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and R2_BUCKET_NAME via .dev.vars (dev) or `wrangler secret put` (production). Guide: https://developers.cloudflare.com/r2/api/s3/tokens/',
        }),
        {
          status: 501,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    })
  }
}
