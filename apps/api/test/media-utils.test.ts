/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect } from 'vitest'
import { extractMediaKey, extractMediaKeysFromData } from '../src/media-utils'
import { ARTICOLO_SEED, PRODOTTO_SEED } from '@beech/core'

describe('media-utils - extractMediaKey', () => {
  it('estrae chiave da URL assoluto', () => {
    expect(extractMediaKey('https://example.com/api/media/1739123456-avatar.png')).toBe(
      '1739123456-avatar.png'
    )
  })

  it('estrae chiave da path relativo', () => {
    expect(extractMediaKey('/api/media/123-foto.jpg')).toBe('123-foto.jpg')
  })

  it('decodifica caratteri URL-encoded nella chiave', () => {
    expect(extractMediaKey('/api/media/1739-foto%20spazi.png')).toBe('1739-foto spazi.png')
  })

  it('restituisce null per URL senza /api/media/', () => {
    expect(extractMediaKey('https://cdn.example.com/images/avatar.png')).toBe(null)
    expect(extractMediaKey('/other/path')).toBe(null)
  })

  it('restituisce null per stringa vuota', () => {
    expect(extractMediaKey('')).toBe(null)
  })
})

describe('media-utils - extractMediaKeysFromData', () => {
  // v0.4.0: entryData uses alias keys (not branch IDs like art_03)
  it('estrae chiave da campo file (stringa singola)', () => {
    const data = {
      title: 'Titolo',
      coverImage: 'https://x.com/api/media/1739-copertina.png',
    }
    expect(extractMediaKeysFromData(ARTICOLO_SEED, data)).toEqual(['1739-copertina.png'])
  })

  it('estrae chiavi da campo json (array di URL)', () => {
    const data = {
      coverImage: '/api/media/111-cover.jpg',
      images: ['/api/media/222-a.jpg', '/api/media/333-b.jpg'],
    }
    expect(extractMediaKeysFromData(PRODOTTO_SEED, data)).toEqual(
      expect.arrayContaining(['111-cover.jpg', '222-a.jpg', '333-b.jpg'])
    )
  })

  it('restituisce chiavi uniche (no duplicati)', () => {
    const data = {
      coverImage: '/api/media/123-same.png',
      tags: { thumb: '/api/media/123-same.png' },
    }
    expect(extractMediaKeysFromData(ARTICOLO_SEED, data)).toEqual(['123-same.png'])
  })

  it('ignora campi non file/json', () => {
    const data = {
      title: 'Titolo',
      body: '<p>Test <img src="/api/media/999-in-richtext.png"></p>',
    }
    // body è richtext: non viene analizzato (solo file e json)
    expect(extractMediaKeysFromData(ARTICOLO_SEED, data)).toEqual([])
  })

  it('restituisce array vuoto per data vuoto', () => {
    expect(extractMediaKeysFromData(ARTICOLO_SEED, {})).toEqual([])
  })
})
