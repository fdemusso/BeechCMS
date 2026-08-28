// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { extractMediaKeysFromData } from '../src/shared/utils/media-utils'
import { TEST_SEEDS } from './fixtures'

const seed = TEST_SEEDS[0] // posts in fixtures

describe('media-utils - extractMediaKeysFromData', () => {
  it('estrae chiave da campo file (stringa singola)', () => {
    const data = {
      title: 'Post',
      image: 'https://example.com/api/media/123-img.png'
    }
    const keys = extractMediaKeysFromData(seed, data)
    expect(keys).toEqual(['123-img.png'])
  })

  it('restituisce array vuoto per data vuoto', () => {
    expect(extractMediaKeysFromData(seed, {})).toEqual([])
  })

  it('ignora URL non Beech', () => {
    const data = {
      image: 'https://other-cdn.com/img.png'
    }
    expect(extractMediaKeysFromData(seed, data)).toEqual([])
  })

  it('estrae chiave da URL con CDN configurato', () => {
    const data = {
      title: 'Post',
      image: 'https://cdn.my-site.com/avatars/123-img.png'
    }
    const keys = extractMediaKeysFromData(seed, data, 'https://cdn.my-site.com')
    expect(keys).toEqual(['avatars/123-img.png'])
  })

  it('estrae chiave con slasi/gerarchia da URL standard', () => {
    const data = {
      title: 'Post',
      image: 'https://example.com/api/media/avatars/user-1.png'
    }
    const keys = extractMediaKeysFromData(seed, data)
    expect(keys).toEqual(['avatars/user-1.png'])
  })

  it('estrae chiave correttamente con trailing slash nel CDN e doppio slash nel path', () => {
    const data = {
      title: 'Post',
      image: 'https://cdn.my-site.com//avatars/123-img.png'
    }
    const keys = extractMediaKeysFromData(seed, data, 'https://cdn.my-site.com/')
    expect(keys).toEqual(['avatars/123-img.png'])
  })

  it('estrae chiave da URL con CDN configurato con prefisso di percorso', () => {
    const data = {
      title: 'Post',
      image: 'https://cdn.my-site.com/assets/avatars/123-img.png'
    }
    const keys = extractMediaKeysFromData(seed, data, 'https://cdn.my-site.com/assets')
    expect(keys).toEqual(['avatars/123-img.png'])
  })

  it('ignora proprietà prototipiche ereditate come constructor e toString', () => {
    const pollutedData = Object.create({
      image: 'https://cdn.my-site.com/evil.png',
      constructor: 'test',
      toString: 'test',
    })
    pollutedData.title = 'Clean Post'
    const keys = extractMediaKeysFromData(seed, pollutedData, 'https://cdn.my-site.com')
    expect(keys).toEqual([])
  })

  it('estrae chiavi media da campi repeater con subfield file (issue #356)', () => {
    const seedWithRepeater = {
      slug: 'pages',
      displayNameAlias: 'title',
      allowDrafts: true,
      branches: [
        {
          id: 'br_slides',
          alias: 'slides',
          type: 'repeater',
          label: 'Slides',
          fields: [{ id: 'br_img', alias: 'image', type: 'file', label: 'Image' }],
        },
      ],
    } as unknown as typeof seed

    const rowData = {
      title: 'Home Page',
      slides: [
        { image: 'https://example.com/api/media/slide1.png' },
        { image: 'https://example.com/api/media/slide2.png' },
      ],
    }

    const keys = extractMediaKeysFromData(seedWithRepeater, rowData)
    expect(keys).toEqual(['slide1.png', 'slide2.png'])
  })
})

