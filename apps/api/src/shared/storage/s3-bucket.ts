// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { AwsClient } from 'aws4fetch'
import { BeechBucket, PutBucketOptions, GetBucketResult, PresignOptions } from '@beechcms/core'

/**
 * Configuration options for initializing an {@link S3Bucket} instance.
 */
export interface S3BucketConfig {
  /** S3 API endpoint URL (e.g. Cloudflare R2 endpoint or MinIO endpoint). */
  endpoint: string
  /** Access Key ID for S3 authentication. */
  accessKeyId: string
  /** Secret Access Key for S3 authentication. */
  secretAccessKey: string
  /** Target S3 bucket name. */
  bucketName: string
  /** Base URL of the API server used for constructing fallback media access URLs. */
  baseUrl: string
  /** Optional CDN base URL prepended to media assets when served via CDN. */
  cdnUrl?: string
}

/**
 * Implementation of {@link BeechBucket} using an S3-compatible API via SigV4-signed `fetch` requests (`aws4fetch`).
 *
 * @remarks
 * Used in production and staging when connecting to Cloudflare R2 or other S3-compatible providers (such as MinIO) over HTTP.
 * Supports standard bucket operations: upload (`put`), retrieval (`get`), metadata inspection (`head`),
 * deletion (`delete`), pagination (`list`), total size calculation (`getTotalSize`), and presigned URL generation (`presignPut`, `presignGet`).
 */
export class S3Bucket implements BeechBucket {
  /** SigV4 signing client configured with the S3 credentials. */
  private client: AwsClient
  /** Path-style bucket URL (`${endpoint}/${bucketName}`) all object URLs are built from. */
  private bucketUrl: string
  /** Base URL of the API server used as the fallback origin for media asset URLs. */
  private baseUrl: string
  /** Optional CDN base URL; when set, media URLs are served from the CDN instead of the API. */
  private cdnUrl: string | null

  /**
   * Initializes a new instance of {@link S3Bucket}.
   *
   * @param config - The S3 client and bucket configuration options.
   */
  constructor(config: S3BucketConfig) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: 'auto',
      retries: 3,
    })
    this.bucketUrl = `${config.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(config.bucketName)}`
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.cdnUrl = config.cdnUrl ? config.cdnUrl.replace(/\/+$/, '') : null
  }

  /** Builds the path-style URL of an object, encoding each key segment. */
  private objectUrl(key: string): string {
    const cleanKey = key.replace(/^\/+/, '')
    return `${this.bucketUrl}/${cleanKey.split('/').map(encodeURIComponent).join('/')}`
  }

  /**
   * Uploads an object to the S3 bucket.
   *
   * @param key - The unique object key (path) within the bucket.
   * @param body - The object content as an `ArrayBuffer`, `Uint8Array`, or `ReadableStream`.
   * @param options - Optional upload settings such as `contentType` and custom `metadata`.
   * @throws {Error} If the S3 upload operation fails.
   * @returns A promise that resolves when the upload completes.
   */
  async put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream, options?: PutBucketOptions): Promise<void> {
    const headers: Record<string, string> = {}
    if (options?.contentType) headers['Content-Type'] = options.contentType
    for (const [name, value] of Object.entries(options?.metadata ?? {})) {
      headers[`x-amz-meta-${name}`] = value
    }
    const response = await this.client.fetch(this.objectUrl(key), {
      method: 'PUT',
      headers,
      body: body instanceof ReadableStream ? body : body instanceof Uint8Array ? body : new Uint8Array(body),
      // Streaming bodies require half-duplex in undici/Workers.
      ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
    } as RequestInit)
    await assertOk(response)
  }

  /**
   * Retrieves an object from the S3 bucket as a stream.
   *
   * @param key - The unique object key (path) within the bucket.
   * @returns A promise resolving to a {@link GetBucketResult} with the object body stream and metadata, or `null` if the object does not exist (`NoSuchKey` / `NotFound`).
   * @throws {Error} If an S3 error other than `NoSuchKey` or `NotFound` occurs (e.g. `AccessDenied`, timeout).
   */
  async get(key: string): Promise<GetBucketResult | null> {
    const response = await this.client.fetch(this.objectUrl(key))
    if (response.status === 404) {
      await response.body?.cancel()
      return null
    }
    await assertOk(response)
    if (!response.body) return null
    return {
      body: response.body,
      contentType: response.headers.get('content-type') ?? undefined,
      size: Number(response.headers.get('content-length') ?? 0),
      metadata: readMetadata(response.headers),
    }
  }

  /**
   * Deletes an object from the S3 bucket.
   *
   * @param key - The unique object key (path) to delete.
   * @throws {Error} If the S3 delete operation fails.
   * @returns A promise that resolves when the object has been deleted.
   */
  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.objectUrl(key), { method: 'DELETE' })
    await assertOk(response)
  }

  /**
   * Retrieves metadata for an object without downloading its payload.
   *
   * @param key - The unique object key (path) within the bucket.
   * @returns A promise resolving to the object's size, content type, and custom metadata, or `null` if the object does not exist.
   * @throws {Error} If an S3 error other than `NoSuchKey` or `NotFound` occurs.
   */
  async head(key: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null> {
    const response = await this.client.fetch(this.objectUrl(key), { method: 'HEAD' })
    if (response.status === 404) return null
    await assertOk(response)
    return {
      size: Number(response.headers.get('content-length') ?? 0),
      contentType: response.headers.get('content-type') ?? undefined,
      metadata: readMetadata(response.headers),
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
   * Iterates through all bucket objects using paginated S3 `ListObjectsV2` requests.
   *
   * @returns A promise resolving to the total storage size in bytes.
   */
  async getTotalSize(): Promise<number> {
    let totalSizeBytes = 0
    let cursor: string | undefined
    do {
      const page = await this.list({ cursor })
      for (const objectItem of page.objects) totalSizeBytes += objectItem.size
      cursor = page.cursor
    } while (cursor)
    return totalSizeBytes
  }

  /**
   * Generates a presigned URL allowing clients to directly upload an object via HTTP PUT.
   *
   * @remarks
   * Binds the expiration time, content type, and expected content length into the AWS SigV4 signature.
   *
   * @param key - The target object key (path) for upload.
   * @param options - Presigning options including `expiresIn`, `contentType`, and `contentLength`.
   * @returns A promise resolving to the presigned PUT URL.
   */
  async presignPut(key: string, options: PresignOptions): Promise<string> {
    // `allHeaders` makes aws4fetch sign Content-Type and Content-Length (it treats them as
    // unsignable by default). Binding them into the signature stops a client from uploading a
    // different MIME type (bypassing the allowlist checked at presign time) or a different size.
    // No checksum header is added, so R2 does not reject the PUT on a CRC32 mismatch.
    const headers: Record<string, string> = {}
    if (options.contentType) headers['Content-Type'] = options.contentType
    if (options.contentLength !== undefined) headers['Content-Length'] = String(options.contentLength)
    const signed = await this.client.sign(this.objectUrl(key) + `?X-Amz-Expires=${options.expiresIn}`, {
      method: 'PUT',
      headers,
      aws: { signQuery: true, allHeaders: true },
    })
    return signed.url
  }

  /**
   * Generates a presigned URL allowing clients to directly download an object via HTTP GET.
   *
   * @param key - The target object key (path) to download.
   * @param options - Presigning options including `expiresIn`.
   * @returns A promise resolving to the presigned GET URL.
   */
  async presignGet(key: string, options: PresignOptions): Promise<string> {
    const signed = await this.client.sign(this.objectUrl(key) + `?X-Amz-Expires=${options.expiresIn}`, {
      method: 'GET',
      aws: { signQuery: true },
    })
    return signed.url
  }

  /**
   * Lists objects in the bucket matching an optional prefix, with pagination support.
   *
   * @param options - Optional listing parameters including `prefix`, `limit` (max keys), and `cursor` (continuation token).
   * @returns A promise resolving to an array of object summaries (key and size) and an optional continuation cursor.
   */
  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> {
    const url = new URL(this.bucketUrl)
    url.searchParams.set('list-type', '2')
    if (options?.prefix) url.searchParams.set('prefix', options.prefix)
    if (options?.limit) url.searchParams.set('max-keys', String(options.limit))
    if (options?.cursor) url.searchParams.set('continuation-token', options.cursor)
    const response = await this.client.fetch(url.toString())
    await assertOk(response)
    const xml = await response.text()

    const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => ({
      key: xmlTag(match[1], 'Key') ?? '',
      size: Number(xmlTag(match[1], 'Size') ?? 0),
    }))
    return { objects, cursor: xmlTag(xml, 'NextContinuationToken') }
  }
}

/** Error raised for a non-2xx S3 response; `code` is the S3 error code (e.g. `AccessDenied`). */
export class S3Error extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = code ?? 'S3Error'
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return
  const body = await response.text().catch(() => '')
  const code = xmlTag(body, 'Code')
  const detail = xmlTag(body, 'Message')
  throw new S3Error(`S3 request failed (${response.status}${code ? ` ${code}` : ''})${detail ? `: ${detail}` : ''}`, response.status, code)
}

/** Collects `x-amz-meta-*` response headers into a plain metadata record. */
function readMetadata(headers: Headers): Record<string, string> {
  const metadata: Record<string, string> = {}
  headers.forEach((value, name) => {
    if (name.startsWith('x-amz-meta-')) metadata[name.slice('x-amz-meta-'.length)] = value
  })
  return metadata
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Extracts and entity-decodes the first `<tag>` text in an S3 XML response. */
function xmlTag(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)
  if (!match) return undefined
  return match[1].replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) return String.fromCodePoint(parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10))
    return XML_ENTITIES[entity.toLowerCase()]
  })
}
