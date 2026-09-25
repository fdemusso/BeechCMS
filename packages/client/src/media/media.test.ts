// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { media, mediaSrcSet } from './index.js'
import type { MediaScalePreset } from './index.js'

describe('media', () => {
  it('builds a root-relative URL from a bare key with defaults omitted', () => {
    const url = media('1717000000-a1b2c3d4-photo.jpg', { preset: 'card' })

    expect(url).toBe('/api/media/1717000000-a1b2c3d4-photo.jpg?preset=card')
  })

  it('prefixes baseUrl and emits preset, format, quality in canonical order', () => {
    const url = media('k.jpg', { preset: 'card', format: 'webp', quality: 'high', baseUrl: 'https://cms.example.com/' })

    expect(url).toBe('https://cms.example.com/api/media/k.jpg?preset=card&format=webp&quality=high')
  })

  it('replaces an existing query and hash on a media URL', () => {
    const url = media('/api/media/k.jpg?preset=old&format=jpeg#section', { preset: 'card' })

    expect(url).toBe('/api/media/k.jpg?preset=card')
  })

  it('refuses a URL outside the media route', () => {
    // MEDIA_CDN_URL links bypass the Worker, so a query there would silently do nothing.
    expect(() => media('https://cdn.example.com/k.jpg', { preset: 'card' })).toThrow(TypeError)
  })

  it('refuses an empty preset', () => {
    expect(() => media('k.jpg', { preset: '' })).toThrow(TypeError)
  })
})

describe('mediaSrcSet', () => {
  it('emits ascending, de-duplicated width descriptors', () => {
    const srcset = mediaSrcSet('k.jpg', ['w-1280', 'w-640', 'w-640'])

    expect(srcset).toBe('/api/media/k.jpg?preset=w-640 640w, /api/media/k.jpg?preset=w-1280 1280w')
  })

  it('carries format and quality into every candidate', () => {
    const srcset = mediaSrcSet('k.jpg', ['w-640', 'w-1280'], { format: 'webp', quality: 'high' })

    expect(srcset).toBe(
      '/api/media/k.jpg?preset=w-640&format=webp&quality=high 640w, /api/media/k.jpg?preset=w-1280&format=webp&quality=high 1280w',
    )
  })

  it('refuses a crop preset name', () => {
    expect(() => mediaSrcSet('k.jpg', ['card' as MediaScalePreset])).toThrow(TypeError)
  })

  it('refuses an empty list', () => {
    expect(() => mediaSrcSet('k.jpg', [])).toThrow(TypeError)
  })
})
