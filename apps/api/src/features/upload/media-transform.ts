// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Transform path of the public media route. Every legal variant is named by a pre-registered preset
 * (see @beechcms/core media-transform); this file only wires storage, the transformer and the edge cache.
 */
import type { Context } from 'hono'
import {
  ABSOLUTE_MAX_MEDIA_DIMENSION,
  DEFAULT_MEDIA_MAX_DIMENSION,
  MediaPresetCatalogError,
  buildImageTransformSpec,
  buildMediaPresetCatalog,
  canonicalMediaTransformQuery,
  computeMediaVariantEtag,
  deriveScaleOutput,
  ifNoneMatchMatches,
  isTransformableMime,
  mediaPresetSignature,
  type MediaPresetCatalog,
  type MediaTransformErrorCode,
  type MediaTransformRequest,
} from '@beechcms/core'
import type { AppEnv } from '../../types'
import { resolveEdgeCache } from '../../shared/utils/edge-cache'

const VARIANT_CACHE_CONTROL = 'public, max-age=31536000, immutable'

type MediaErrorCode = MediaTransformErrorCode | 'media_preset_catalog_invalid' | 'media_transform_failed'

const MEDIA_ERROR_MESSAGES: Record<MediaErrorCode, string> = {
  media_param_forbidden: 'Free-form transform parameters are not supported; use a named preset',
  media_param_duplicated: 'Transform parameters may appear at most once',
  media_preset_required: 'format and quality require a preset',
  media_format_invalid: 'format must be one of original, webp, jpeg',
  media_quality_invalid: 'quality must be one of low, medium, high',
  media_preset_unknown: 'Unknown media preset',
  media_not_transformable: 'Cannot transform non-raster asset',
  media_dimension_exceeded: 'Derived variant exceeds the maximum dimension',
  media_preset_catalog_invalid: 'Media preset catalog is misconfigured',
  media_transform_failed: 'Image transformation failed',
}

export function mediaTransformError(c: Context<AppEnv>, status: 400 | 500 | 502, code: MediaErrorCode): Response {
  return c.json({ error: code, message: MEDIA_ERROR_MESSAGES[code] }, status)
}

export function resolveMediaMaxDimension(env: { MEDIA_MAX_DIMENSION?: string }): number {
  const raw = env.MEDIA_MAX_DIMENSION
  if (!raw) return DEFAULT_MEDIA_MAX_DIMENSION
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MEDIA_MAX_DIMENSION
  return Math.min(parsed, ABSOLUTE_MAX_MEDIA_DIMENSION)
}

// Per-isolate memo keyed on the raw inputs: a changed binding value rebuilds, a malformed one is
// logged once instead of on every request.
let catalogMemo: { raw: string | undefined; maxDimension: number; result: MediaPresetCatalog | MediaPresetCatalogError } | null = null

export function resolveMediaPresetCatalog(env: { MEDIA_PRESETS?: string; MEDIA_MAX_DIMENSION?: string }): MediaPresetCatalog | MediaPresetCatalogError {
  const raw = env.MEDIA_PRESETS?.trim() || undefined
  const maxDimension = resolveMediaMaxDimension(env)
  if (catalogMemo && catalogMemo.raw === raw && catalogMemo.maxDimension === maxDimension) return catalogMemo.result

  let result: MediaPresetCatalog | MediaPresetCatalogError
  try {
    result = buildMediaPresetCatalog(raw === undefined ? undefined : JSON.parse(raw), maxDimension)
  } catch (error) {
    result = error instanceof MediaPresetCatalogError ? error : new MediaPresetCatalogError('MEDIA_PRESETS is not valid JSON')
    console.error(`[serveMediaHandler] ${result.message}`)
  }
  catalogMemo = { raw, maxDimension, result }
  return result
}

function toStream(body: ReadableStream | ArrayBuffer): ReadableStream<Uint8Array> {
  return body instanceof ArrayBuffer ? new Response(body).body! : (body as ReadableStream<Uint8Array>)
}

async function discard(body: ReadableStream | ArrayBuffer | null | undefined): Promise<void> {
  if (body && !(body instanceof ArrayBuffer)) await body.cancel().catch(() => undefined)
}

function encodeMediaKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function notModified(etag: string): Response {
  return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': VARIANT_CACHE_CONTROL } })
}

/**
 * Serves a preset variant of an already-sanitized storage key.
 * Order: catalog → edge cache (+ source existence) → R2 → raster check → passthrough | ETag/304 →
 * scale clamp → transform → cache write. Every 400 is decided before any transformation runs.
 */
export async function serveTransformedMedia(c: Context<AppEnv>, key: string, request: MediaTransformRequest): Promise<Response> {
  const catalog = resolveMediaPresetCatalog(c.env)
  if (catalog instanceof MediaPresetCatalogError) return mediaTransformError(c, 500, 'media_preset_catalog_invalid')
  const preset = catalog.get(request.preset)
  if (!preset) return mediaTransformError(c, 400, 'media_preset_unknown')

  const { bucket, imageTransformer } = c.var
  const edgeCache = imageTransformer ? resolveEdgeCache(c) : null
  // The preset signature is part of the key so a redefined preset never hits an old variant.
  const cacheKey = new Request(
    `${new URL(c.req.url).origin}/api/media/${encodeMediaKey(key)}?${canonicalMediaTransformQuery(request)}&_p=${mediaPresetSignature(preset)}`,
  )

  if (edgeCache) {
    const hit = await edgeCache.cache.match(cacheKey)
    if (hit) {
      // DELETE /api/upload/:key cannot purge other colos' caches; a cached variant must not outlive its source.
      if (!(await bucket.head(key))) {
        await discard(hit.body)
        edgeCache.executionCtx.waitUntil(edgeCache.cache.delete(cacheKey))
        return new Response('Not found', { status: 404 })
      }
      const cachedEtag = hit.headers.get('ETag')
      if (cachedEtag && ifNoneMatchMatches(c.req.header('If-None-Match'), cachedEtag)) {
        await discard(hit.body)
        return notModified(cachedEtag)
      }
      // Cache API responses carry immutable headers; the security-header middleware writes after next().
      return new Response(hit.body, hit)
    }
  }

  const object = await bucket.get(key)
  if (!object) return new Response('Not found', { status: 404 })

  const sourceMime = object.contentType ?? 'application/octet-stream'
  if (!isTransformableMime(sourceMime)) {
    await discard(object.body)
    return mediaTransformError(c, 400, 'media_not_transformable')
  }

  if (!imageTransformer) {
    // no-store: an immutable passthrough would pin the untransformed original under the variant URL
    // in every browser that saw it before the IMAGES binding was enabled.
    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': sourceMime,
        'Cache-Control': 'no-store',
        'X-Beech-Media-Transform': 'passthrough-unsupported',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  }

  const etag = await computeMediaVariantEtag({ key, size: object.size }, request, preset)
  if (ifNoneMatchMatches(c.req.header('If-None-Match'), etag)) {
    await discard(object.body)
    return notModified(etag)
  }

  let source = toStream(object.body)
  if (preset.kind === 'scale') {
    const [probeStream, transformStream] = source.tee()
    let dimensions
    try {
      dimensions = await imageTransformer.probe(probeStream)
    } catch (error) {
      console.error(`[serveMediaHandler] probe failed for ${key}:`, error)
      await discard(transformStream)
      return mediaTransformError(c, 502, 'media_transform_failed')
    }
    if (!deriveScaleOutput(preset.width, dimensions, resolveMediaMaxDimension(c.env))) {
      await discard(transformStream)
      return mediaTransformError(c, 400, 'media_dimension_exceeded')
    }
    source = transformStream
  }

  let transformed
  try {
    transformed = await imageTransformer.transform(source, buildImageTransformSpec(preset, request, sourceMime))
  } catch (error) {
    console.error(`[serveMediaHandler] transform failed for ${key}:`, error)
    return mediaTransformError(c, 502, 'media_transform_failed')
  }

  const response = new Response(transformed.body, {
    status: 200,
    headers: {
      'Content-Type': transformed.contentType,
      'Cache-Control': VARIANT_CACHE_CONTROL,
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
  if (edgeCache) {
    edgeCache.executionCtx.waitUntil(
      edgeCache.cache.put(cacheKey, response.clone()).catch((error: unknown) => {
        console.error(`[serveMediaHandler] cache put failed for ${key}:`, error)
      }),
    )
  }
  return response
}
