/**
 * BeechBucket - S3-like interface for object storage in BeechCMS.
 * 
 * This interface abstracts the underlying storage provider (R2, S3, or Local)
 * allowing the application to scale without being tied to a specific vendor.
 */
export interface PutBucketOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface GetBucketResult {
  body: ReadableStream | ArrayBuffer;
  contentType?: string;
  size: number;
  metadata?: Record<string, string>;
}

export interface BeechBucket {
  /**
   * Uploads an object to the bucket.
   * @param key The unique key (path) for the object.
   * @param body The data to store.
   * @param options Optional metadata like content type.
   */
  put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream, options?: PutBucketOptions): Promise<void>;

  /**
   * Retrieves an object from the bucket.
   * @param key The unique key for the object.
   * @returns The object data and metadata, or null if not found.
   */
  get(key: string): Promise<GetBucketResult | null>;

  /**
   * Deletes an object from the bucket.
   * @param key The unique key for the object.
   */
  delete(key: string): Promise<void>;

  /**
   * Retrieves metadata for an object without downloading its content.
   * @param key The unique key for the object.
   */
  head(key: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null>;

  /**
   * Returns a publicly accessible URL for the given key.
   * The implementation decides if this is a direct vendor URL (CDN) 
   * or a proxied URL through the Beech API.
   * @param key The unique key for the object.
   */
  getUrl(key: string): string;

  /**
   * Calculates the total size of all objects in the bucket.
   * Warning: This may be an expensive operation on some providers.
   */
  getTotalSize(): Promise<number>;

  /**
   * Lists objects in the bucket.
   */
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }>;
}
