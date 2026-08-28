// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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
 * Implementation of {@link BeechBucket} using an S3-compatible API via the AWS SDK.
 *
 * @remarks
 * Used in production and staging when connecting to Cloudflare R2 or other S3-compatible providers (such as MinIO) over HTTP.
 * Supports standard bucket operations: upload (`put`), retrieval (`get`), metadata inspection (`head`),
 * deletion (`delete`), pagination (`list`), total size calculation (`getTotalSize`), and presigned URL generation (`presignPut`, `presignGet`).
 */
export class S3Bucket implements BeechBucket {
  /** AWS SDK S3 client configured with custom endpoint, credentials, and path-style addressing. */
  private client: S3Client
  /** Name of the target S3/R2 bucket. */
  private bucketName: string
  /** Base URL of the API server used as the fallback origin for media asset URLs. */
  private baseUrl: string
  /** Optional custom CDN base URL used to serve media assets directly from a CDN. */
  private cdnUrl: string | null

  /**
   * Initializes a new instance of {@link S3Bucket}.
   *
   * @param config - The S3 client and bucket configuration options.
   */
  constructor(config: S3BucketConfig) {
    // requestChecksumCalculation/responseChecksumValidation exist at runtime in AWS SDK v3
    // but are not yet in the TypeScript types for this version. Casting via unknown to pass them
    // through: without them the SDK adds x-amz-checksum-crc32 to presigned URLs, which causes
    // R2 to reject PUT requests when the CRC32 of the uploaded file doesn't match.
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'when_required',
      responseChecksumValidation: 'when_required',
    } as unknown as import('@aws-sdk/client-s3').S3ClientConfig)
    this.bucketName = config.bucketName
    this.baseUrl = config.baseUrl
    this.cdnUrl = config.cdnUrl ?? null
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
    const payload = body instanceof ReadableStream
      ? body
      : body instanceof Uint8Array
        ? body
        : new Uint8Array(body)

    const putCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: payload,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
    })
    await this.client.send(putCommand)
  }

  /**
   * Retrieves an object from the S3 bucket as a stream.
   *
   * @param key - The unique object key (path) within the bucket.
   * @returns A promise resolving to a {@link GetBucketResult} with the object body stream and metadata, or `null` if the object does not exist (`NoSuchKey` / `NotFound`).
   * @throws {Error} If an S3 error other than `NoSuchKey` or `NotFound` occurs (e.g. `AccessDenied`, timeout).
   */
  async get(key: string): Promise<GetBucketResult | null> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })
      const response = await this.client.send(getCommand)
      
      if (!response.Body) return null

      const rawResponseBody = response.Body as { transformToWebStream?: () => ReadableStream }
      const bodyStream: ReadableStream = typeof rawResponseBody.transformToWebStream === 'function'
        ? rawResponseBody.transformToWebStream()
        : response.Body as unknown as ReadableStream

      return {
        body: bodyStream,
        contentType: response.ContentType,
        size: response.ContentLength ?? 0,
        metadata: response.Metadata,
      }
    } catch (error: unknown) {
      const errorName = (error as { name?: string })?.name
      const errorMessage = (error as { message?: string })?.message
      const httpStatusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
      if (errorName === 'NoSuchKey' || errorName === 'NotFound' || errorMessage === 'NoSuchKey' || httpStatusCode === 404) {
        return null
      }
      // Rethrow other errors (AccessDenied, Timeout, etc.)
      throw error
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
    const deleteCommand = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    })
    await this.client.send(deleteCommand)
  }

  /**
   * Retrieves metadata for an object without downloading its payload.
   *
   * @param key - The unique object key (path) within the bucket.
   * @returns A promise resolving to the object's size, content type, and custom metadata, or `null` if the object does not exist.
   * @throws {Error} If an S3 error other than `NoSuchKey` or `NotFound` occurs.
   */
  async head(key: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })
      const response = await this.client.send(headCommand)
      return {
        size: response.ContentLength ?? 0,
        contentType: response.ContentType,
        metadata: response.Metadata,
      }
    } catch (error: unknown) {
      const errorName = (error as { name?: string })?.name
      const errorMessage = (error as { message?: string })?.message
      const httpStatusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
      if (errorName === 'NoSuchKey' || errorName === 'NotFound' || errorMessage === 'NoSuchKey' || httpStatusCode === 404) {
        return null
      }
      throw error
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
    let continuationToken: string | undefined
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        ContinuationToken: continuationToken,
      })
      const response = await this.client.send(listCommand)
      for (const objectItem of response.Contents ?? []) {
        totalSizeBytes += objectItem.Size ?? 0
      }
      continuationToken = response.NextContinuationToken
    } while (continuationToken)
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
    // ContentLength is included to enforce expected size constraints via signature/policy
    // headers on direct PUT uploads, ensuring the client cannot upload a different size.
    const putCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
    })
    return getSignedUrl(this.client, putCommand, { expiresIn: options.expiresIn })
  }

  /**
   * Generates a presigned URL allowing clients to directly download an object via HTTP GET.
   *
   * @param key - The target object key (path) to download.
   * @param options - Presigning options including `expiresIn`.
   * @returns A promise resolving to the presigned GET URL.
   */
  async presignGet(key: string, options: PresignOptions): Promise<string> {
    const getCommand = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    })
    return getSignedUrl(this.client, getCommand, { expiresIn: options.expiresIn })
  }

  /**
   * Lists objects in the bucket matching an optional prefix, with pagination support.
   *
   * @param options - Optional listing parameters including `prefix`, `limit` (max keys), and `cursor` (continuation token).
   * @returns A promise resolving to an array of object summaries (key and size) and an optional continuation cursor.
   */
  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> {
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: options?.prefix,
      MaxKeys: options?.limit,
      ContinuationToken: options?.cursor,
    })
    const response = await this.client.send(listCommand)
    return {
      objects: (response.Contents ?? []).map((objectItem) => ({
        key: objectItem.Key ?? '',
        size: objectItem.Size ?? 0,
      })),
      cursor: response.NextContinuationToken,
    }
  }
}

