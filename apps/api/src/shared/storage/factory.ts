import { BeechBucket, PutBucketOptions, GetBucketResult } from '@beechcms/core'
import { Env } from '../../types'
import { R2BindingBucket } from './r2-binding-bucket'
import { S3Bucket } from './s3-bucket'

class NullBucket implements BeechBucket {
  private fail(): never {
    throw new Error('No storage provider configured. Set MEDIA_BUCKET or R2 credentials.')
  }
  put(_key: string, _body: ArrayBuffer | Uint8Array | ReadableStream, _options?: PutBucketOptions): Promise<void> { return this.fail() }
  get(_key: string): Promise<GetBucketResult | null> { return this.fail() }
  delete(_key: string): Promise<void> { return this.fail() }
  head(_key: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null> { return this.fail() }
  getUrl(_key: string): string { return this.fail() }
  getTotalSize(): Promise<number> { return this.fail() }
  list(_options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> { return this.fail() }
}

/**
 * Creates the appropriate BeechBucket based on available bindings/credentials.
 * Uses capability detection: R2 binding takes precedence over S3-compatible credentials.
 */
export function createBucketProvider(env: Env, baseUrl: string): BeechBucket {
  if (env.MEDIA_BUCKET) {
    return new R2BindingBucket(env.MEDIA_BUCKET, baseUrl)
  }

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
