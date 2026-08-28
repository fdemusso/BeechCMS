// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { extractMediaKey, extractMediaKeysFromData } from './media-utils'
import type { Seed } from '@beechcms/core'

const CDN_URL = 'https://cdn.example.com'

// ─── extractMediaKey ────────────────────────────────────────────────────────

describe('extractMediaKey', () => {
  it('extracts key for exact CDN origin match', () => {
    expect(extractMediaKey('https://cdn.example.com/1739-avatar.png', CDN_URL)).toBe('1739-avatar.png')
  })

  it('rejects subdomain-confusion URLs (cdn.example.com.attacker.com)', () => {
    const evil = 'https://cdn.example.com.attacker.com/api/media/attacker-key'
    expect(extractMediaKey(evil, CDN_URL)).toBe('attacker-key')
  })

  it('rejects suffix-confusion URLs (cdn.example.comANYTHING)', () => {
    const evil = 'https://cdn.example.comANYTHING'
    expect(extractMediaKey(evil, CDN_URL)).toBeNull()
  })

  it('does not let attacker control key via literal CDN prefix without /api/media/', () => {
    const evil = 'https://cdn.example.com.attacker.com/ATTACKER_CHOSEN_KEY'
    expect(extractMediaKey(evil, CDN_URL)).toBeNull()
  })

  it('falls back to /api/media/ pattern when no cdnUrl configured', () => {
    expect(extractMediaKey('https://x.com/api/media/123-foto.png')).toBe('123-foto.png')
  })

  it('falls back to /api/media/ pattern when origin does not match cdnUrl', () => {
    expect(extractMediaKey('https://other.com/api/media/123-foto.png', CDN_URL)).toBe('123-foto.png')
  })

  it('extracts key correctly when CDN URL has trailing slashes and media URL has double leading slash', () => {
    expect(extractMediaKey('https://cdn.example.com//1739-avatar.png', 'https://cdn.example.com/')).toBe('1739-avatar.png')
    expect(extractMediaKey('https://cdn.example.com///folder/sub/1739-avatar.png', 'https://cdn.example.com///')).toBe('folder/sub/1739-avatar.png')
  })

  it('extracts key correctly when CDN URL contains a pathname prefix', () => {
    expect(extractMediaKey('https://cdn.example.com/assets/1739-avatar.png', 'https://cdn.example.com/assets')).toBe('1739-avatar.png')
    expect(extractMediaKey('https://cdn.example.com/assets/1739-avatar.png', 'https://cdn.example.com/assets/')).toBe('1739-avatar.png')
    expect(extractMediaKey('https://cdn.example.com/assets/nested/1739-avatar.png', 'https://cdn.example.com/assets')).toBe('nested/1739-avatar.png')
    expect(extractMediaKey('https://cdn.example.com/assets/nested/1739-avatar.png', 'https://cdn.example.com/assets/')).toBe('nested/1739-avatar.png')
    expect(extractMediaKey('https://cdn.example.com/v1/media/1739-avatar.png', 'https://cdn.example.com/v1/media')).toBe('1739-avatar.png')
  })

  it('does not match CDN prefix if pathname does not match prefix boundary', () => {
    expect(extractMediaKey('https://cdn.example.com/assets-other/1739-avatar.png', 'https://cdn.example.com/assets')).toBeNull()
    expect(extractMediaKey('https://cdn.example.com/other/1739-avatar.png', 'https://cdn.example.com/assets')).toBeNull()
    expect(extractMediaKey('https://cdn.example.com/assets', 'https://cdn.example.com/assets')).toBeNull()
  })

  it('returns null for unrelated strings', () => {
    expect(extractMediaKey('not a url', CDN_URL)).toBeNull()
  })
})

// ─── extractMediaKeysFromData ───────────────────────────────────────────────

describe('extractMediaKeysFromData', () => {
  const SEED = {
    slug: 'articoli',
    displayNameAlias: 'title',
    allowDrafts: true,
    branches: [
      { id: 'br_01', alias: 'cover', type: 'file' },
      { id: 'br_02', alias: 'gallery', type: 'json' },
    ],
  } as unknown as Seed

  it('falls back to /api/media/ pattern instead of trusting subdomain-confusion prefix', () => {
    const evil = 'https://cdn.example.com.attacker.com/api/media/victim-key'
    const keys = extractMediaKeysFromData(SEED, { cover: evil }, CDN_URL)
    expect(keys).toEqual(['victim-key'])
  })

  it('extracts legit key from same-origin CDN URL', () => {
    const keys = extractMediaKeysFromData(SEED, { cover: `${CDN_URL}/1739-avatar.png` }, CDN_URL)
    expect(keys).toEqual(['1739-avatar.png'])
  })

  it('extracts legit key from CDN URL with pathname prefix', () => {
    const cdnWithPrefix = 'https://cdn.example.com/assets'
    const keys = extractMediaKeysFromData(
      SEED,
      {
        cover: 'https://cdn.example.com/assets/1739-avatar.png',
        gallery: [
          'https://cdn.example.com/assets/gallery-1.png',
          'https://cdn.example.com/assets/sub/gallery-2.png',
        ],
      },
      cdnWithPrefix
    )
    expect(keys).toEqual(['1739-avatar.png', 'gallery-1.png', 'sub/gallery-2.png'])
  })

  it('safely ignores inherited prototype properties without false matches or errors', () => {
    const pollutedData = Object.create({
      cover: 'https://cdn.example.com/evil-prototype.png',
      gallery: ['https://cdn.example.com/evil-gallery.png'],
      constructor: 'https://cdn.example.com/evil-constructor.png',
      toString: 'https://cdn.example.com/evil-toString.png',
    })

    const keys = extractMediaKeysFromData(SEED, pollutedData, CDN_URL)
    expect(keys).toEqual([])
  })
})

