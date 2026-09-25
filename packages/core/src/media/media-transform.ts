// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { sha256hex } from '../engine/policies.js'
import type { ImageOutputMime, ImageTransformSpec, MediaDimensions } from './image-transformer.js'

/** Default ceiling, in pixels, on either side of a derived variant. Covers native 32:9 ultrawide panels. */
export const DEFAULT_MEDIA_MAX_DIMENSION = 5120
/** MEDIA_MAX_DIMENSION may lower the ceiling freely but raise it only this far. */
export const ABSOLUTE_MAX_MEDIA_DIMENSION = 8192

export type MediaOutputFormat = 'original' | 'webp' | 'jpeg'
export type MediaQuality = 'low' | 'medium' | 'high'

export const MEDIA_OUTPUT_FORMATS: readonly MediaOutputFormat[] = ['original', 'webp', 'jpeg']
export const MEDIA_QUALITIES: readonly MediaQuality[] = ['low', 'medium', 'high']
export const DEFAULT_MEDIA_FORMAT: MediaOutputFormat = 'original'
export const DEFAULT_MEDIA_QUALITY: MediaQuality = 'medium'
/** Encoder quality per enum value. `medium` ≈ 82 per the brief. */
export const MEDIA_QUALITY_VALUES: Readonly<Record<MediaQuality, number>> = Object.freeze({ low: 60, medium: 82, high: 92 })

export type MediaPreset =
  | { readonly kind: 'crop'; readonly width: number; readonly height: number }
  | { readonly kind: 'scale'; readonly width: number }

export type MediaPresetCatalog = ReadonlyMap<string, MediaPreset>

export const DEFAULT_MEDIA_SCALE_WIDTHS = [320, 480, 640, 768, 1024, 1280, 1536, 1920, 2560, 3840, 5120] as const

export const DEFAULT_MEDIA_PRESETS: Readonly<Record<string, MediaPreset>> = Object.freeze({
  thumbnail: { kind: 'crop', width: 200, height: 200 },
  avatar: { kind: 'crop', width: 128, height: 128 },
  card: { kind: 'crop', width: 400, height: 300 },
  'og-image': { kind: 'crop', width: 1200, height: 630 },
  hero: { kind: 'crop', width: 1920, height: 800 },
  ...Object.fromEntries(DEFAULT_MEDIA_SCALE_WIDTHS.map((width) => [`w-${width}`, { kind: 'scale', width } as const])),
})

/** Raster sources the transform path accepts. Everything else — SVG, PDF, video, AVIF, BMP, ICO — is refused. */
export const TRANSFORMABLE_MEDIA_MIME_TYPES: readonly ImageOutputMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** Parameters of the discarded free-form contract. Their presence is an error, never ignored. */
export const FORBIDDEN_MEDIA_TRANSFORM_PARAMS: readonly string[] = ['w', 'h', 'width', 'height', 'fit', 'q']

export type MediaTransformErrorCode =
  | 'media_param_forbidden'
  | 'media_param_duplicated'
  | 'media_preset_required'
  | 'media_format_invalid'
  | 'media_quality_invalid'
  | 'media_preset_unknown'
  | 'media_not_transformable'
  | 'media_dimension_exceeded'

export interface MediaTransformRequest {
  readonly preset: string
  readonly format: MediaOutputFormat
  readonly quality: MediaQuality
}

export type MediaTransformQuery =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly code: MediaTransformErrorCode }
  | { readonly kind: 'transform'; readonly request: MediaTransformRequest }

/** Thrown by buildMediaPresetCatalog on any malformed MEDIA_PRESETS entry. Fail closed, never fall back. */
export class MediaPresetCatalogError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid media preset catalog: ${reason}`)
    this.name = 'MediaPresetCatalogError'
  }
}

const PRESET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/
const SCALE_NAME_PATTERN = /^w-([1-9]\d*)$/

const invalid = (code: MediaTransformErrorCode): MediaTransformQuery => ({ kind: 'invalid', code })

/**
 * Classifies a media query string. Pure: does not consult the catalog (that is env-dependent and
 * resolved by the caller), so an unknown-but-well-formed preset name returns `transform`.
 */
export function parseMediaTransformQuery(params: URLSearchParams): MediaTransformQuery {
  if (FORBIDDEN_MEDIA_TRANSFORM_PARAMS.some((name) => params.has(name))) return invalid('media_param_forbidden')

  const presets = params.getAll('preset')
  const formats = params.getAll('format')
  const qualities = params.getAll('quality')
  if (presets.length > 1 || formats.length > 1 || qualities.length > 1) return invalid('media_param_duplicated')
  if (presets.length === 0 && formats.length === 0 && qualities.length === 0) return { kind: 'none' }

  const preset = presets[0]
  if (!preset) return invalid('media_preset_required')

  const format = formats[0] ?? DEFAULT_MEDIA_FORMAT
  if (!(MEDIA_OUTPUT_FORMATS as readonly string[]).includes(format)) return invalid('media_format_invalid')

  const quality = qualities[0] ?? DEFAULT_MEDIA_QUALITY
  if (!(MEDIA_QUALITIES as readonly string[]).includes(quality)) return invalid('media_quality_invalid')

  if (!PRESET_NAME_PATTERN.test(preset)) return invalid('media_preset_unknown')

  return { kind: 'transform', request: { preset, format: format as MediaOutputFormat, quality: quality as MediaQuality } }
}

/**
 * Canonical query for a request: fixed order preset → format → quality, defaults omitted.
 * `@beechcms/client` emits exactly this string; the server recomputes it and never trusts the client's.
 */
export function canonicalMediaTransformQuery(request: MediaTransformRequest): string {
  let query = `preset=${encodeURIComponent(request.preset)}`
  if (request.format !== DEFAULT_MEDIA_FORMAT) query += `&format=${request.format}`
  if (request.quality !== DEFAULT_MEDIA_QUALITY) query += `&quality=${request.quality}`
  return query
}

function isPositiveIntegerAtMost(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max
}

function parsePresetEntry(name: string, value: unknown, maxDimension: number): MediaPreset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MediaPresetCatalogError(`preset "${name}" must be an object or null`)
  }
  const entry = value as Record<string, unknown>
  const scaleMatch = SCALE_NAME_PATTERN.exec(name)

  if (entry.kind === 'crop') {
    if (Object.keys(entry).some((field) => !['kind', 'width', 'height'].includes(field))) {
      throw new MediaPresetCatalogError(`preset "${name}" has unknown fields`)
    }
    if (scaleMatch) throw new MediaPresetCatalogError(`"${name}" is reserved for scale presets`)
    if (!isPositiveIntegerAtMost(entry.width, maxDimension) || !isPositiveIntegerAtMost(entry.height, maxDimension)) {
      throw new MediaPresetCatalogError(`preset "${name}" needs integer width/height in 1..${maxDimension}`)
    }
    return { kind: 'crop', width: entry.width, height: entry.height }
  }

  if (entry.kind === 'scale') {
    if (Object.keys(entry).some((field) => !['kind', 'width'].includes(field))) {
      throw new MediaPresetCatalogError(`preset "${name}" has unknown fields (scale presets never take a height)`)
    }
    if (!isPositiveIntegerAtMost(entry.width, maxDimension)) {
      throw new MediaPresetCatalogError(`preset "${name}" needs an integer width in 1..${maxDimension}`)
    }
    if (name !== `w-${entry.width}`) throw new MediaPresetCatalogError(`scale preset "${name}" must be named "w-${entry.width}"`)
    return { kind: 'scale', width: entry.width }
  }

  throw new MediaPresetCatalogError(`preset "${name}" has kind other than "crop" | "scale"`)
}

/**
 * Builds the active catalog: DEFAULT_MEDIA_PRESETS merged by name with `overrides`
 * (the parsed MEDIA_PRESETS JSON). An override value of `null` removes a preset.
 * Defaults larger than `maxDimension` are dropped (they could only ever 400); an operator-supplied
 * preset larger than `maxDimension` is an error.
 *
 * @throws {MediaPresetCatalogError} on any malformed override.
 */
export function buildMediaPresetCatalog(overrides: unknown, maxDimension: number): MediaPresetCatalog {
  const catalog = new Map<string, MediaPreset>()
  for (const [name, preset] of Object.entries(DEFAULT_MEDIA_PRESETS)) {
    const largest = preset.kind === 'crop' ? Math.max(preset.width, preset.height) : preset.width
    if (largest <= maxDimension) catalog.set(name, preset)
  }
  if (overrides === undefined) return catalog

  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
    throw new MediaPresetCatalogError('MEDIA_PRESETS must be a JSON object keyed by preset name')
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (!PRESET_NAME_PATTERN.test(name)) throw new MediaPresetCatalogError(`"${name}" is not a valid preset name`)
    if (value === null) {
      catalog.delete(name)
      continue
    }
    catalog.set(name, parsePresetEntry(name, value, maxDimension))
  }
  return catalog
}

export function isTransformableMime(mime: string | null | undefined): boolean {
  if (!mime) return false
  const normalised = mime.split(';')[0].trim().toLowerCase()
  return (TRANSFORMABLE_MEDIA_MIME_TYPES as readonly string[]).includes(normalised)
}

/**
 * Output dimensions of a scale preset (`fit=scale-down`: never upscales). Returns `null` when either
 * side would exceed `maxDimension` — the pathological-aspect-ratio guard of brief §4. Never truncates.
 */
export function deriveScaleOutput(presetWidth: number, source: MediaDimensions, maxDimension: number): MediaDimensions | null {
  if (source.width <= 0 || source.height <= 0) return null
  const output = source.width <= presetWidth
    ? { width: source.width, height: source.height }
    : { width: presetWidth, height: Math.max(1, Math.round((source.height * presetWidth) / source.width)) }
  return output.width > maxDimension || output.height > maxDimension ? null : output
}

/** Identity of a preset's *definition*, so redefining a name never reuses an old variant. */
export function mediaPresetSignature(preset: MediaPreset): string {
  return preset.kind === 'crop' ? `crop:${preset.width}x${preset.height}` : `scale:${preset.width}`
}

/** Precondition: `isTransformableMime(sourceMime)` is true. */
export function buildImageTransformSpec(preset: MediaPreset, request: MediaTransformRequest, sourceMime: string): ImageTransformSpec {
  const outputMime: ImageOutputMime = request.format === 'webp'
    ? 'image/webp'
    : request.format === 'jpeg'
      ? 'image/jpeg'
      : (sourceMime.split(';')[0].trim().toLowerCase() as ImageOutputMime)
  const quality = MEDIA_QUALITY_VALUES[request.quality]
  return preset.kind === 'crop'
    ? { width: preset.width, height: preset.height, fit: 'cover', outputMime, quality }
    : { width: preset.width, fit: 'scale-down', outputMime, quality }
}

/**
 * Strong ETag of a variant: source identity (key + size — keys are never overwritten) plus the
 * canonical request plus the preset definition. Format: `"mv1-<32 hex>"`.
 */
export async function computeMediaVariantEtag(
  source: { readonly key: string; readonly size: number },
  request: MediaTransformRequest,
  preset: MediaPreset,
): Promise<string> {
  const digest = await sha256hex(`${source.key}\n${source.size}\n${canonicalMediaTransformQuery(request)}\n${mediaPresetSignature(preset)}`)
  return `"mv1-${digest.slice(0, 32)}"`
}

/** RFC 9110 §13.1.2: `*` matches; otherwise weak comparison against a comma-separated list. */
export function ifNoneMatchMatches(header: string | null | undefined, etag: string | null | undefined): boolean {
  if (!header || !etag) return false
  const target = etag.replace(/^W\//, '')
  return header.split(',').some((candidate) => {
    const trimmed = candidate.trim()
    return trimmed === '*' || trimmed.replace(/^W\//, '') === target
  })
}
