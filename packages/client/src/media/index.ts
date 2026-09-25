// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export type MediaFormat = 'original' | 'webp' | 'jpeg'
export type MediaQuality = 'low' | 'medium' | 'high'
/** Scale presets are always named after their width; the server rejects any other shape. */
export type MediaScalePreset = `w-${number}`

export interface MediaUrlOptions {
  /** BeechCMS API origin. Used only when `keyOrUrl` is a bare storage key; omitted → root-relative URL. */
  baseUrl?: string
  format?: MediaFormat
  quality?: MediaQuality
}

export interface MediaOptions extends MediaUrlOptions {
  preset: string
}

const MEDIA_PATH = '/api/media/'
const SCALE_PRESET_PATTERN = /^w-([1-9]\d*)$/

function canonicalQuery(preset: string, format: MediaFormat = 'original', quality: MediaQuality = 'medium'): string {
  let query = `preset=${encodeURIComponent(preset)}`
  if (format !== 'original') query += `&format=${format}`
  if (quality !== 'medium') query += `&quality=${quality}`
  return query
}

function resolveMediaPath(keyOrUrl: string, baseUrl?: string): string {
  const bare = keyOrUrl.split('#')[0].split('?')[0]
  if (!bare) throw new TypeError('media(): keyOrUrl is empty')
  if (/^https?:\/\//i.test(bare) || bare.startsWith('/')) {
    if (!bare.includes(MEDIA_PATH)) {
      throw new TypeError(`media(): "${keyOrUrl}" is not a ${MEDIA_PATH} URL; only the BeechCMS media route transforms images`)
    }
    return bare
  }
  const encodedKey = bare.split('/').map(encodeURIComponent).join('/')
  return `${(baseUrl ?? '').replace(/\/+$/, '')}${MEDIA_PATH}${encodedKey}`
}

/** Canonical URL of a preset variant. Existing query and hash on `keyOrUrl` are discarded. */
export function media(keyOrUrl: string, options: MediaOptions): string {
  if (!options.preset) throw new TypeError('media(): preset is required')
  return `${resolveMediaPath(keyOrUrl, options.baseUrl)}?${canonicalQuery(options.preset, options.format, options.quality)}`
}

/**
 * `srcset` value built only from scale presets (`w-<width>`), ascending, de-duplicated.
 * Crop presets are refused: a srcset of fixed crops would lie about intrinsic widths.
 */
export function mediaSrcSet(keyOrUrl: string, presets: readonly MediaScalePreset[], options: MediaUrlOptions = {}): string {
  if (presets.length === 0) throw new TypeError('mediaSrcSet(): at least one scale preset is required')
  const widths = new Map<number, string>()
  for (const preset of presets) {
    const match = SCALE_PRESET_PATTERN.exec(preset)
    if (!match) throw new TypeError(`mediaSrcSet(): "${preset}" is not a scale preset (w-<width>)`)
    widths.set(Number(match[1]), preset)
  }
  return [...widths.entries()]
    .sort(([a], [b]) => a - b)
    .map(([width, preset]) => `${media(keyOrUrl, { ...options, preset })} ${width}w`)
    .join(', ')
}
