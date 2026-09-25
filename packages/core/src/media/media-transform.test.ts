// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  buildImageTransformSpec,
  buildMediaPresetCatalog,
  canonicalMediaTransformQuery,
  computeMediaVariantEtag,
  DEFAULT_MEDIA_MAX_DIMENSION,
  deriveScaleOutput,
  FORBIDDEN_MEDIA_TRANSFORM_PARAMS,
  ifNoneMatchMatches,
  isTransformableMime,
  MediaPresetCatalogError,
  parseMediaTransformQuery,
} from './media-transform.js'
import type { MediaTransformRequest } from './media-transform.js'

describe('parseMediaTransformQuery', () => {
  it('returns none when no transform parameter is present, even with unrelated parameters', () => {
    const result = parseMediaTransformQuery(new URLSearchParams('v=3'))

    expect(result).toEqual({ kind: 'none' })
  })

  it('refuses every discarded free-form parameter with media_param_forbidden', () => {
    const cases = FORBIDDEN_MEDIA_TRANSFORM_PARAMS.flatMap((name) => [
      new URLSearchParams(`${name}=1`),
      new URLSearchParams(`${name}=1&preset=card`),
    ])

    for (const params of cases) {
      expect(parseMediaTransformQuery(params)).toEqual({ kind: 'invalid', code: 'media_param_forbidden' })
    }
  })

  it('refuses a repeated preset, format or quality with media_param_duplicated', () => {
    const cases = [
      new URLSearchParams('preset=card&preset=hero'),
      new URLSearchParams('preset=card&format=webp&format=jpeg'),
      new URLSearchParams('preset=card&quality=low&quality=high'),
    ]

    for (const params of cases) {
      expect(parseMediaTransformQuery(params)).toEqual({ kind: 'invalid', code: 'media_param_duplicated' })
    }
  })

  it('refuses format or quality without a preset with media_preset_required', () => {
    const cases = [
      new URLSearchParams('format=webp'),
      new URLSearchParams('quality=low'),
      new URLSearchParams('preset=&format=webp'),
    ]

    for (const params of cases) {
      expect(parseMediaTransformQuery(params)).toEqual({ kind: 'invalid', code: 'media_preset_required' })
    }
  })

  it('refuses a format outside original|webp|jpeg with media_format_invalid', () => {
    const cases = ['avif', 'WEBP', '']

    for (const format of cases) {
      const params = new URLSearchParams(`preset=card&format=${format}`)
      expect(parseMediaTransformQuery(params)).toEqual({ kind: 'invalid', code: 'media_format_invalid' })
    }
  })

  it('refuses a quality outside low|medium|high with media_quality_invalid', () => {
    const cases = ['82', 'max', '']

    for (const quality of cases) {
      const params = new URLSearchParams(`preset=card&quality=${quality}`)
      expect(parseMediaTransformQuery(params)).toEqual({ kind: 'invalid', code: 'media_quality_invalid' })
    }
  })

  it('refuses a preset name outside the name grammar with media_preset_unknown', () => {
    const cases = ['../x', 'Card', 'a'.repeat(33)]

    for (const preset of cases) {
      const params = new URLSearchParams({ preset })
      expect(parseMediaTransformQuery(params)).toEqual({ kind: 'invalid', code: 'media_preset_unknown' })
    }
  })

  it('applies original and medium when format and quality are omitted', () => {
    const result = parseMediaTransformQuery(new URLSearchParams('preset=card'))

    expect(result).toEqual({ kind: 'transform', request: { preset: 'card', format: 'original', quality: 'medium' } })
  })

  it('yields the same request regardless of parameter order', () => {
    const first = parseMediaTransformQuery(new URLSearchParams('quality=high&preset=card&format=webp'))
    const second = parseMediaTransformQuery(new URLSearchParams('format=webp&preset=card&quality=high'))

    expect(first).toEqual(second)
  })
})

describe('canonicalMediaTransformQuery', () => {
  it('omits default format and quality', () => {
    const query = canonicalMediaTransformQuery({ preset: 'card', format: 'original', quality: 'medium' })

    expect(query).toBe('preset=card')
  })

  it('emits preset, format, quality in fixed order', () => {
    const query = canonicalMediaTransformQuery({ preset: 'card', format: 'webp', quality: 'high' })

    expect(query).toBe('preset=card&format=webp&quality=high')
  })
})

describe('buildMediaPresetCatalog', () => {
  it('returns the default catalog when no overrides are given', () => {
    const catalog = buildMediaPresetCatalog(undefined, DEFAULT_MEDIA_MAX_DIMENSION)

    expect(catalog.get('card')).toEqual({ kind: 'crop', width: 400, height: 300 })
    expect(catalog.get('w-5120')).toEqual({ kind: 'scale', width: 5120 })
    expect(catalog.size).toBe(16)
  })

  it('adds, redefines and removes presets by name', () => {
    const catalog = buildMediaPresetCatalog(
      { banner: { kind: 'crop', width: 1600, height: 400 }, card: { kind: 'crop', width: 600, height: 400 }, hero: null },
      DEFAULT_MEDIA_MAX_DIMENSION,
    )

    expect(catalog.get('banner')).toEqual({ kind: 'crop', width: 1600, height: 400 })
    expect(catalog.get('card')).toEqual({ kind: 'crop', width: 600, height: 400 })
    expect(catalog.has('hero')).toBe(false)
  })

  it('drops defaults larger than a lowered ceiling', () => {
    const catalog = buildMediaPresetCatalog(undefined, 2000)

    expect(catalog.has('w-2560')).toBe(false)
    expect(catalog.has('w-3840')).toBe(false)
    expect(catalog.has('w-5120')).toBe(false)
    expect(catalog.get('hero')).toEqual({ kind: 'crop', width: 1920, height: 800 })
  })

  it('rejects malformed overrides with MediaPresetCatalogError', () => {
    const cases: unknown[] = [
      [],
      'nope',
      { Bad: { kind: 'crop', width: 10, height: 10 } },
      { x: { kind: 'blur' } },
      { x: { kind: 'crop', width: 0, height: 10 } },
      { x: { kind: 'crop', width: 1.5, height: 10 } },
      { 'w-100': { kind: 'crop', width: 100, height: 100 } },
      { big: { kind: 'scale', width: 640 } },
      { 'w-640': { kind: 'scale', width: 640, height: 10 } },
      { x: { kind: 'crop', width: 9000, height: 10 } },
    ]

    for (const overrides of cases) {
      expect(() => buildMediaPresetCatalog(overrides, DEFAULT_MEDIA_MAX_DIMENSION)).toThrow(MediaPresetCatalogError)
    }
  })
})

describe('deriveScaleOutput', () => {
  it('downscales keeping the aspect ratio', () => {
    const output = deriveScaleOutput(640, { width: 4000, height: 3000 }, DEFAULT_MEDIA_MAX_DIMENSION)

    expect(output).toEqual({ width: 640, height: 480 })
  })

  it('never upscales a source narrower than the preset', () => {
    const output = deriveScaleOutput(640, { width: 300, height: 200 }, DEFAULT_MEDIA_MAX_DIMENSION)

    expect(output).toEqual({ width: 300, height: 200 })
  })

  it('returns null when the derived height exceeds the ceiling', () => {
    // Regression guard for the pathological-aspect-ratio amplification described in brief §4.
    const output = deriveScaleOutput(640, { width: 1000, height: 60000 }, DEFAULT_MEDIA_MAX_DIMENSION)

    expect(output).toBeNull()
  })

  it('returns null for a narrow source whose own height exceeds the ceiling', () => {
    const output = deriveScaleOutput(640, { width: 300, height: 9000 }, DEFAULT_MEDIA_MAX_DIMENSION)

    expect(output).toBeNull()
  })
})

describe('buildImageTransformSpec', () => {
  it('maps a crop preset to fit=cover with fixed width and height', () => {
    const request: MediaTransformRequest = { preset: 'card', format: 'webp', quality: 'medium' }

    const spec = buildImageTransformSpec({ kind: 'crop', width: 400, height: 300 }, request, 'image/jpeg')

    expect(spec).toEqual({ width: 400, height: 300, fit: 'cover', outputMime: 'image/webp', quality: 82 })
  })

  it('maps a scale preset to fit=scale-down without a height', () => {
    const request: MediaTransformRequest = { preset: 'w-640', format: 'original', quality: 'medium' }

    const spec = buildImageTransformSpec({ kind: 'scale', width: 640 }, request, 'image/png')

    expect(spec).toEqual({ width: 640, fit: 'scale-down', outputMime: 'image/png', quality: 82 })
  })

  it('keeps the source MIME when format is original', () => {
    const request: MediaTransformRequest = { preset: 'card', format: 'original', quality: 'medium' }

    const spec = buildImageTransformSpec({ kind: 'crop', width: 400, height: 300 }, request, 'image/png; charset=binary')

    expect(spec.outputMime).toBe('image/png')
  })
})

describe('computeMediaVariantEtag', () => {
  const source = { key: '1717000000-a1b2c3d4-photo.jpg', size: 1024 }
  const request: MediaTransformRequest = { preset: 'card', format: 'webp', quality: 'medium' }
  const preset = { kind: 'crop' as const, width: 400, height: 300 }

  it('is identical for identical inputs', async () => {
    const first = await computeMediaVariantEtag(source, request, preset)
    const second = await computeMediaVariantEtag(source, request, preset)

    expect(first).toBe(second)
    expect(first).toMatch(/^"mv1-[0-9a-f]{32}"$/)
  })

  it('changes when the preset definition changes under the same name', async () => {
    // Guards VETO correction 3: redefining a preset must not serve a stale variant under the old ETag.
    const original = await computeMediaVariantEtag(source, request, preset)
    const redefined = await computeMediaVariantEtag(source, request, { kind: 'crop', width: 600, height: 400 })

    expect(redefined).not.toBe(original)
  })

  it('changes when the source size changes', async () => {
    const original = await computeMediaVariantEtag(source, request, preset)
    const resized = await computeMediaVariantEtag({ ...source, size: 2048 }, request, preset)

    expect(resized).not.toBe(original)
  })
})

describe('ifNoneMatchMatches', () => {
  it('matches exact, weak-prefixed, list and wildcard headers; rejects a mismatch or a null header', () => {
    const etag = '"mv1-abc123"'
    const cases: Array<[string | null, string, boolean]> = [
      [etag, etag, true],
      [`W/${etag}`, etag, true],
      [`"other", ${etag}`, etag, true],
      ['*', etag, true],
      ['"different"', etag, false],
      [null, etag, false],
    ]

    for (const [header, candidate, expected] of cases) {
      expect(ifNoneMatchMatches(header, candidate)).toBe(expected)
    }
  })
})

describe('isTransformableMime', () => {
  it('accepts jpeg, png, gif and webp; rejects svg, pdf, avif, video and undefined', () => {
    const cases: Array<[string | undefined, boolean]> = [
      ['image/jpeg', true],
      ['image/png', true],
      ['image/gif', true],
      ['image/webp', true],
      ['image/svg+xml', false],
      ['application/pdf', false],
      ['image/avif', false],
      ['video/mp4', false],
      [undefined, false],
    ]

    for (const [mime, expected] of cases) {
      expect(isTransformableMime(mime)).toBe(expected)
    }
  })
})
