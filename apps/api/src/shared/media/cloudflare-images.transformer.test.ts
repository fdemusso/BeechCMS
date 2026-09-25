// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import type { ImageTransformSpec } from '@beechcms/core'
import { CloudflareImagesTransformer } from './cloudflare-images.transformer'

const OUTPUT_STREAM = new Blob(['out']).stream()

function fakeImagesBinding(info: ImageInfoResponse, recordedTransforms: ImageTransform[]): ImagesBinding {
  return {
    info: async () => info,
    input: () => ({
      transform(transform: ImageTransform) {
        recordedTransforms.push(transform)
        return this
      },
      draw() {
        throw new Error('not used')
      },
      output: async (options: ImageOutputOptions) => ({
        response: () => new Response(OUTPUT_STREAM),
        contentType: () => options.format,
        image: () => OUTPUT_STREAM,
      }),
    }),
    hosted: undefined as unknown as HostedImagesBinding,
  }
}

describe('CloudflareImagesTransformer', () => {
  it('forwards width, height and fit to transform for a crop spec', async () => {
    const cropTransforms: ImageTransform[] = []
    const cropTransformer = new CloudflareImagesTransformer(fakeImagesBinding({ format: 'image/jpeg', fileSize: 10, width: 10, height: 10 }, cropTransforms))
    const cropSpec: ImageTransformSpec = { width: 400, height: 300, fit: 'cover', outputMime: 'image/webp', quality: 82 }

    await cropTransformer.transform(new Blob(['in']).stream(), cropSpec)

    expect(cropTransforms).toEqual([{ width: 400, height: 300, fit: 'cover' }])
  })

  it('omits height in the recorded transform for a scale spec', async () => {
    const scaleTransforms: ImageTransform[] = []
    const scaleTransformer = new CloudflareImagesTransformer(fakeImagesBinding({ format: 'image/jpeg', fileSize: 10, width: 10, height: 10 }, scaleTransforms))
    const scaleSpec: ImageTransformSpec = { width: 640, fit: 'scale-down', outputMime: 'image/webp', quality: 82 }

    await scaleTransformer.transform(new Blob(['in']).stream(), scaleSpec)

    expect(scaleTransforms[0].height).toBeUndefined()
  })

  it('returns the binding\'s content type and image stream', async () => {
    const recorded: ImageTransform[] = []
    const transformer = new CloudflareImagesTransformer(fakeImagesBinding({ format: 'image/jpeg', fileSize: 10, width: 10, height: 10 }, recorded))
    const spec: ImageTransformSpec = { width: 400, height: 300, fit: 'cover', outputMime: 'image/webp', quality: 82 }

    const result = await transformer.transform(new Blob(['in']).stream(), spec)

    expect(result.contentType).toBe('image/webp')
    expect(result.body).toBe(OUTPUT_STREAM)
  })

  it('rejects when the binding reports an SVG source', async () => {
    const transformer = new CloudflareImagesTransformer(fakeImagesBinding({ format: 'image/svg+xml' }, []))

    await expect(transformer.probe(new Blob(['<svg/>']).stream())).rejects.toThrow()
  })

  it('resolves width and height for a raster source', async () => {
    const transformer = new CloudflareImagesTransformer(fakeImagesBinding({ format: 'image/jpeg', fileSize: 12345, width: 800, height: 600 }, []))

    const dimensions = await transformer.probe(new Blob(['<bytes>']).stream())

    expect(dimensions).toEqual({ width: 800, height: 600 })
  })
})
