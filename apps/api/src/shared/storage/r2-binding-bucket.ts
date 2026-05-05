import { BeechBucket, PutBucketOptions, GetBucketResult } from '@beechcms/core'

/**
 * Implementation of BeechBucket using Cloudflare R2 native binding.
 * Used for local development (Miniflare) or native Cloudflare Workers deployment.
 */
export class R2BindingBucket implements BeechBucket {
  constructor(
    private bucket: R2Bucket,
    private baseUrl: string
  ) {}

  async put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream, options?: PutBucketOptions): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType: options?.contentType },
      customMetadata: options?.metadata
    })
  }

  async get(key: string): Promise<GetBucketResult | null> {
    const object = await this.bucket.get(key)
    if (!object) return null

    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType,
      size: object.size,
      metadata: object.customMetadata
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
      metadata: object.customMetadata
    }
  }

  getUrl(key: string): string {
    // If baseUrl is just the origin, we use the proxied route.
    // If it's a custom CDN/R2 domain, it might not need /api/media/
    // but for now, we maintain the contract: the provider decides the full URL.
    if (this.baseUrl.includes('/api/media')) {
       return `${this.baseUrl}/${encodeURIComponent(key)}`
    }
    return `${this.baseUrl}/api/media/${encodeURIComponent(key)}`
  }

  async getTotalSize(): Promise<number> {
    let total = 0
    let cursor: string | undefined
    do {
      const result: R2Objects = await this.bucket.list({ cursor })
      for (const obj of result.objects) {
        total += obj.size
      }
      cursor = result.truncated ? result.cursor : undefined
    } while (cursor)
    return total
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> {
    const result = await this.bucket.list({
      prefix: options?.prefix,
      limit: options?.limit,
      cursor: options?.cursor
    })
    return {
      objects: result.objects.map(obj => ({ key: obj.key, size: obj.size })),
      cursor: result.truncated ? result.cursor : undefined
    }
  }
}
