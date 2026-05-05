import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { BeechBucket, PutBucketOptions, GetBucketResult } from '@beechcms/core'

/**
 * Implementation of BeechBucket using S3-compatible API (AWS SDK).
 * Used for production when connecting to R2 or any other S3 provider via HTTP.
 */
export class S3Bucket implements BeechBucket {
  private client: S3Client
  private bucketName: string
  private baseUrl: string

  private cdnUrl: string | null

  constructor(config: {
    endpoint: string,
    accessKeyId: string,
    secretAccessKey: string,
    bucketName: string,
    baseUrl: string,
    cdnUrl?: string,
  }) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    })
    this.bucketName = config.bucketName
    this.baseUrl = config.baseUrl
    this.cdnUrl = config.cdnUrl ?? null
  }

  async put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream, options?: PutBucketOptions): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body instanceof ReadableStream ? await this.streamToUint8Array(body) : new Uint8Array(body as ArrayBuffer),
      ContentType: options?.contentType,
      Metadata: options?.metadata
    })
    await this.client.send(command)
  }

  private async streamToUint8Array(stream: ReadableStream): Promise<Uint8Array> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let totalLength = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalLength += value.length
    }
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }

  async get(key: string): Promise<GetBucketResult | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      })
      const response = await this.client.send(command)
      
      if (!response.Body) return null

      const rawBody = response.Body as any
      const body: ReadableStream = typeof rawBody.transformToWebStream === 'function'
        ? rawBody.transformToWebStream()
        : rawBody as ReadableStream

      return {
        body,
        contentType: response.ContentType,
        size: response.ContentLength ?? 0,
        metadata: response.Metadata
      }
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.message === 'NoSuchKey') {
        return null
      }
      // Rethrow other errors (AccessDenied, Timeout, etc.)
      throw err
    }
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key
    })
    await this.client.send(command)
  }

  async head(key: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      })
      const response = await this.client.send(command)
      return {
        size: response.ContentLength ?? 0,
        contentType: response.ContentType,
        metadata: response.Metadata
      }
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.name === 'NotFound') return null
      throw err
    }
  }

  getUrl(key: string): string {
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${encodeURIComponent(key)}`
    }
    return `${this.baseUrl}/api/media/${encodeURIComponent(key)}`
  }

  async getTotalSize(): Promise<number> {
    let total = 0
    let token: string | undefined
    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        ContinuationToken: token
      })
      const response = await this.client.send(command)
      for (const obj of response.Contents ?? []) {
        total += obj.Size ?? 0
      }
      token = response.NextContinuationToken
    } while (token)
    return total
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: options?.prefix,
      MaxKeys: options?.limit,
      ContinuationToken: options?.cursor
    })
    const response = await this.client.send(command)
    return {
      objects: (response.Contents ?? []).map(obj => ({
        key: obj.Key ?? '',
        size: obj.Size ?? 0
      })),
      cursor: response.NextContinuationToken
    }
  }
}
