// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** Pixel dimensions of an image. */
export interface MediaDimensions {
  readonly width: number
  readonly height: number
}

/** Output MIME types the transform path may emit. AVIF is deliberately absent (v1). */
export type ImageOutputMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

/**
 * A fully resolved transformation. Every number here comes from a pre-registered preset or from
 * MEDIA_QUALITY_VALUES — never from the request.
 */
export interface ImageTransformSpec {
  readonly width: number
  /** Present for crop presets only; scale presets derive height from the source aspect ratio. */
  readonly height?: number
  readonly fit: 'cover' | 'scale-down'
  readonly outputMime: ImageOutputMime
  readonly quality: number
}

export interface TransformedImage {
  readonly body: ReadableStream<Uint8Array>
  readonly contentType: string
}

/**
 * Port for edge image transformation. The API injects a Cloudflare Images adapter when the
 * `IMAGES` binding exists and `null` otherwise; handlers never see the binding itself.
 */
export interface IImageTransformer {
  /** Reads the source's pixel dimensions. Rejects when the stream is not a raster image. */
  probe(source: ReadableStream<Uint8Array>): Promise<MediaDimensions>
  /** Applies the spec and returns the encoded variant. */
  transform(source: ReadableStream<Uint8Array>, spec: ImageTransformSpec): Promise<TransformedImage>
}
