// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Transform path of GET /api/media/:key, unit tier. Storage and the image transformer are faked
 * (both cross an I/O boundary). The `caches` global does not exist in Node, so every `it()` outside
 * the nested "edge cache" describe below runs with `resolveEdgeCache` returning `null` by construction.
 * That nested describe stubs `caches.default` and passes an `executionCtx` to exercise the cache-hit,
 * stale-source-eviction and cache-write paths directly; the real Cloudflare Cache API semantics are
 * still confirmed only by the manual edge smoke in §5 step 7.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { BeechBucket, GetBucketResult, IImageTransformer, ImageTransformSpec, MediaDimensions, TransformedImage } from '@beechcms/core'
import type { AppEnv } from '../../types'
import { serveMediaHandler } from './index'

const PHOTO_KEY = '1717000000-a1b2c3d4-photo.png'
const PDF_KEY = '1717000000-a1b2c3d4-doc.pdf'
const PHOTO_BYTES = new Uint8Array(16).fill(7)
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46])
const OUTPUT_BYTES = new Uint8Array([1, 2, 3])

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader()
  while (!(await reader.read()).done) {
    // exhaust the stream
  }
}

class InMemoryBucket implements BeechBucket {
  reads = 0
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>()

  async get(key: string): Promise<GetBucketResult | null> {
    this.reads++
    const object = this.objects.get(key)
    if (!object) return null
    return { body: new Blob([object.bytes]).stream(), contentType: object.contentType, size: object.bytes.byteLength }
  }

  async head(key: string) {
    this.reads++
    const object = this.objects.get(key)
    if (!object) return null
    return { size: object.bytes.byteLength, contentType: object.contentType }
  }

  put(): Promise<void> {
    throw new Error('not used')
  }
  delete(): Promise<void> {
    throw new Error('not used')
  }
  getUrl(): string {
    throw new Error('not used')
  }
  getTotalSize(): Promise<number> {
    throw new Error('not used')
  }
  list(): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> {
    throw new Error('not used')
  }
  presignPut(): Promise<string> {
    throw new Error('not used')
  }
  presignGet(): Promise<string> {
    throw new Error('not used')
  }
}

class RecordingTransformer implements IImageTransformer {
  probeResult: MediaDimensions = { width: 4000, height: 3000 }
  specs: ImageTransformSpec[] = []
  fail = false
  failProbe = false

  async probe(source: ReadableStream<Uint8Array>): Promise<MediaDimensions> {
    await drain(source)
    if (this.failProbe) throw new Error('probe failed')
    return this.probeResult
  }

  async transform(source: ReadableStream<Uint8Array>, spec: ImageTransformSpec): Promise<TransformedImage> {
    await drain(source)
    if (this.fail) throw new Error('transform failed')
    this.specs.push(spec)
    return { body: new Blob([OUTPUT_BYTES]).stream(), contentType: spec.outputMime }
  }
}

/**
 * Minimal stand-in for `caches.default`, keyed by request URL like the real Cache API.
 * `match()` reconstructs an independent Response from stored bytes on every call, exactly as the
 * real Cache API does — reusing the literal Response object handed to `put()` ties its body to that
 * object's clone/tee pair and hangs `ReadableStream.cancel()` under Node's fetch implementation.
 */
class FakeCache {
  private readonly store = new Map<string, { status: number; headers: Headers; bytes: Uint8Array }>()
  matchCalls: Request[] = []
  putCalls: Array<[Request, Response]> = []
  deleteCalls: Request[] = []

  async match(request: Request): Promise<Response | undefined> {
    this.matchCalls.push(request)
    const entry = this.store.get(request.url)
    return entry ? new Response(entry.bytes, { status: entry.status, headers: new Headers(entry.headers) }) : undefined
  }

  async put(request: Request, response: Response): Promise<void> {
    this.putCalls.push([request, response])
    const bytes = new Uint8Array(await response.arrayBuffer())
    this.store.set(request.url, { status: response.status, headers: response.headers, bytes })
  }

  async delete(request: Request): Promise<boolean> {
    this.deleteCalls.push(request)
    return this.store.delete(request.url)
  }
}

describe('serveMediaHandler — transform path', () => {
  let bucket: InMemoryBucket
  let transformer: RecordingTransformer
  let app: Hono<AppEnv>

  function buildApp(imageTransformer: IImageTransformer | null): Hono<AppEnv> {
    const instance = new Hono<AppEnv>()
    instance.use('*', async (context, next) => {
      context.set('bucket', bucket)
      context.set('imageTransformer', imageTransformer)
      await next()
    })
    instance.get('/api/media/:key{.+}', (context) => serveMediaHandler(context))
    return instance
  }

  function request(path: string, env: Record<string, string> = {}, headers: Record<string, string> = {}) {
    return app.request(path, { headers }, env)
  }

  beforeEach(() => {
    bucket = new InMemoryBucket()
    bucket.objects.set(PHOTO_KEY, { bytes: PHOTO_BYTES, contentType: 'image/png' })
    bucket.objects.set(PDF_KEY, { bytes: PDF_BYTES, contentType: 'application/pdf' })
    transformer = new RecordingTransformer()
    app = buildApp(transformer)
  })

  it('a request without transform parameters keeps the legacy headers and bytes', async () => {
    // Backward-compat guard: the no-query branch must stay byte-for-byte what it was before this sprint.
    const response = await request(`/api/media/${PHOTO_KEY}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('ETag')).toBeNull()
    expect(response.headers.get('X-Beech-Media-Transform')).toBeNull()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PHOTO_BYTES)
    expect(transformer.specs).toHaveLength(0)
  })

  it('a discarded free-form parameter is refused with media_param_forbidden before any storage read', async () => {
    const response = await request(`/api/media/${PHOTO_KEY}?w=800`)

    expect(response.status).toBe(400)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_param_forbidden')
    expect(bucket.reads).toBe(0)
  })

  it('an unknown preset is refused with media_preset_unknown before any storage read', async () => {
    const response = await request(`/api/media/${PHOTO_KEY}?preset=nope`)

    expect(response.status).toBe(400)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_preset_unknown')
    expect(bucket.reads).toBe(0)
  })

  it('format without a preset is refused with media_preset_required', async () => {
    const response = await request(`/api/media/${PHOTO_KEY}?format=webp`)

    expect(response.status).toBe(400)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_preset_required')
  })

  it('a non-raster source is refused with media_not_transformable and never transformed', async () => {
    const response = await request(`/api/media/${PDF_KEY}?preset=card`)

    expect(response.status).toBe(400)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_not_transformable')
    expect(transformer.specs).toHaveLength(0)
  })

  it('a crop preset is transformed with the preset\'s fixed dimensions and cached immutably', async () => {
    const response = await request(`/api/media/${PHOTO_KEY}?preset=card&format=webp`)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('ETag')).toMatch(/^"mv1-[0-9a-f]{32}"$/)
    expect(transformer.specs[0]).toEqual({ width: 400, height: 300, fit: 'cover', outputMime: 'image/webp', quality: 82 })
  })

  it('parameter order does not change the variant ETag', async () => {
    const first = await request(`/api/media/${PHOTO_KEY}?quality=high&preset=card`)

    const second = await request(`/api/media/${PHOTO_KEY}?preset=card&quality=high`)

    expect(second.headers.get('ETag')).toBe(first.headers.get('ETag'))
  })

  it('a matching If-None-Match is answered 304 without transforming', async () => {
    const first = await request(`/api/media/${PHOTO_KEY}?preset=card`)
    const etag = first.headers.get('ETag')!
    transformer.specs = []

    const response = await request(`/api/media/${PHOTO_KEY}?preset=card`, {}, { 'If-None-Match': etag })

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
    expect(transformer.specs).toHaveLength(0)
  })

  it('a scale preset whose derived height exceeds the ceiling is refused with media_dimension_exceeded', async () => {
    // Regression guard for the pathological-aspect-ratio amplification described in brief §4.
    transformer.probeResult = { width: 1000, height: 60000 }

    const response = await request(`/api/media/${PHOTO_KEY}?preset=w-640`)

    expect(response.status).toBe(400)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_dimension_exceeded')
    expect(transformer.specs).toHaveLength(0)
  })

  it('a scale preset is transformed with fit=scale-down and no height', async () => {
    const response = await request(`/api/media/${PHOTO_KEY}?preset=w-640`)

    expect(response.status).toBe(200)
    expect(transformer.specs[0]).toEqual({ width: 640, fit: 'scale-down', outputMime: 'image/png', quality: 82 })
  })

  it('a probe failure discards the transform stream and is reported as 502 media_transform_failed', async () => {
    transformer.failProbe = true

    const response = await request(`/api/media/${PHOTO_KEY}?preset=w-640`)

    expect(response.status).toBe(502)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_transform_failed')
    // transform() is never reached: proves the probe-failure branch discards its half of the teed
    // stream instead of handing a partially consumed source to a transform call.
    expect(transformer.specs).toHaveLength(0)
  })

  it('MEDIA_PRESETS adds a preset by name', async () => {
    const env = { MEDIA_PRESETS: '{"banner":{"kind":"crop","width":1600,"height":400},"hero":null}' }

    const response = await request(`/api/media/${PHOTO_KEY}?preset=banner`, env)

    expect(response.status).toBe(200)
    expect(transformer.specs[0]).toEqual({ width: 1600, height: 400, fit: 'cover', outputMime: 'image/png', quality: 82 })
  })

  it('MEDIA_PRESETS removes a default preset by mapping it to null', async () => {
    const env = { MEDIA_PRESETS: '{"banner":{"kind":"crop","width":1600,"height":400},"hero":null}' }

    const response = await request(`/api/media/${PHOTO_KEY}?preset=hero`, env)

    expect(response.status).toBe(400)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_preset_unknown')
  })

  it('a malformed MEDIA_PRESETS fails closed with media_preset_catalog_invalid', async () => {
    const response = await request(`/api/media/${PHOTO_KEY}?preset=card`, { MEDIA_PRESETS: '{' })

    expect(response.status).toBe(500)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_preset_catalog_invalid')
    // The no-parameter path under this same malformed env is asserted by the next case.
  })

  it('a malformed MEDIA_PRESETS leaves untransformed serving intact', async () => {
    const response = await request(`/api/media/${PHOTO_KEY}`, { MEDIA_PRESETS: '{' })

    expect(response.status).toBe(200)
  })

  it('a transformer failure is reported as 502 media_transform_failed', async () => {
    transformer.fail = true

    const response = await request(`/api/media/${PHOTO_KEY}?preset=card`)

    expect(response.status).toBe(502)
    const body = await response.json<{ error: string }>()
    expect(body.error).toBe('media_transform_failed')
  })

  it('a missing key under a valid preset is 404', async () => {
    const response = await request('/api/media/1717000000-deadbeef-missing.png?preset=card')

    expect(response.status).toBe(404)
  })

  describe('edge cache', () => {
    let cache: FakeCache
    let waitUntilCalls: Promise<unknown>[]

    function executionCtx() {
      return { waitUntil: (promise: Promise<unknown>) => waitUntilCalls.push(promise) }
    }

    async function flush(): Promise<void> {
      await Promise.all(waitUntilCalls)
    }

    function cachedRequest(path: string, headers: Record<string, string> = {}) {
      return app.request(path, { headers }, {}, executionCtx())
    }

    beforeEach(() => {
      cache = new FakeCache()
      waitUntilCalls = []
      vi.stubGlobal('caches', { default: cache })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('a transformed variant is written to the edge cache after the response is sent', async () => {
      const response = await cachedRequest(`/api/media/${PHOTO_KEY}?preset=card`)

      expect(response.status).toBe(200)
      await flush()
      expect(cache.putCalls).toHaveLength(1)
      const [, cachedResponse] = cache.putCalls[0]
      expect(cachedResponse.headers.get('ETag')).toBe(response.headers.get('ETag'))
    })

    it('a cache hit serves the cached variant without invoking the transformer', async () => {
      await cachedRequest(`/api/media/${PHOTO_KEY}?preset=card`)
      await flush()
      transformer.specs = []
      cache.matchCalls = []

      const response = await cachedRequest(`/api/media/${PHOTO_KEY}?preset=card`)

      expect(response.status).toBe(200)
      expect(cache.matchCalls).toHaveLength(1)
      expect(transformer.specs).toHaveLength(0)
    })

    it('a cache hit whose source was deleted is evicted and reported as 404', async () => {
      // Regression guard for VETO correction 4: a Cache API hit must not outlive its R2 source.
      await cachedRequest(`/api/media/${PHOTO_KEY}?preset=card`)
      await flush()
      bucket.objects.delete(PHOTO_KEY)

      const response = await cachedRequest(`/api/media/${PHOTO_KEY}?preset=card`)

      expect(response.status).toBe(404)
      await flush()
      expect(cache.deleteCalls).toHaveLength(1)
    })

    it('a cache hit matching If-None-Match is answered 304 without re-serving the cached body', async () => {
      const first = await cachedRequest(`/api/media/${PHOTO_KEY}?preset=card`)
      await flush()
      const etag = first.headers.get('ETag')!

      const response = await cachedRequest(`/api/media/${PHOTO_KEY}?preset=card`, { 'If-None-Match': etag })

      expect(response.status).toBe(304)
      expect(await response.text()).toBe('')
    })
  })
})
