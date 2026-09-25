// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IImageTransformer, ImageTransformSpec, MediaDimensions, TransformedImage } from '@beechcms/core'

/**
 * {@link IImageTransformer} over the Workers Images binding. Consumes the stream `BeechBucket.get()`
 * returns, so it works identically behind `S3Bucket` and `R2BucketAdapter`. EXIF orientation is
 * applied by the Images runtime on decode; no `rotate` is passed.
 */
export class CloudflareImagesTransformer implements IImageTransformer {
  constructor(private readonly images: ImagesBinding) {}

  async probe(source: ReadableStream<Uint8Array>): Promise<MediaDimensions> {
    const info = await this.images.info(source)
    if (!('width' in info)) throw new Error('Images binding reported a vector source')
    return { width: info.width, height: info.height }
  }

  async transform(source: ReadableStream<Uint8Array>, spec: ImageTransformSpec): Promise<TransformedImage> {
    const result = await this.images
      .input(source)
      .transform({ width: spec.width, height: spec.height, fit: spec.fit })
      .output({ format: spec.outputMime, quality: spec.quality })
    return { body: result.image(), contentType: result.contentType() }
  }
}
