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

export interface PresignOptions {
  /** Duration of the signed URL in seconds. */
  expiresIn: number;
  /** Content-Type bound in the signature (PUT). */
  contentType?: string;
  /** Expected Content-Length in bytes (PUT). */
  contentLength?: number;
}

export interface BeechBucket {
  put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream, options?: PutBucketOptions): Promise<void>;
  get(key: string): Promise<GetBucketResult | null>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<{ size: number; contentType?: string; metadata?: Record<string, string> } | null>;
  getUrl(key: string): string;
  getTotalSize(): Promise<number>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }>;

  /** Generates a signed URL for direct upload (PUT). */
  presignPut(key: string, options: PresignOptions): Promise<string>;

  /** Generates a signed URL for direct read (GET). */
  presignGet(key: string, options: PresignOptions): Promise<string>;
}
