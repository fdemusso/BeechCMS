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
  it('estrae chiave da campo file (stringa singola)', () => {
    const data = {
      art_01: 'Titolo',
      art_03: 'https://x.com/api/media/1739-copertina.png',
    }
    expect(extractMediaKeysFromData(ARTICOLO_SEED, data)).toEqual(['1739-copertina.png'])
  })

  it('estrae chiavi da campo json (array di URL)', () => {
    const data = {
      prd_05: '/api/media/111-cover.jpg',
      prd_06: ['/api/media/222-a.jpg', '/api/media/333-b.jpg'],
    }
    expect(extractMediaKeysFromData(PRODOTTO_SEED, data)).toEqual(
      expect.arrayContaining(['111-cover.jpg', '222-a.jpg', '333-b.jpg'])
    )
  })

  it('restituisce chiavi uniche (no duplicati)', () => {
    const data = {
      art_03: '/api/media/123-same.png',
      art_04: { thumb: '/api/media/123-same.png' },
    }
    expect(extractMediaKeysFromData(ARTICOLO_SEED, data)).toEqual(['123-same.png'])
  })

  it('ignora campi non file/json', () => {
    const data = {
      art_01: 'Titolo',
      art_05: '<p>Test <img src="/api/media/999-in-richtext.png"></p>',
    }
    // art_05 è richtext: non viene analizzato (solo file e json)
    expect(extractMediaKeysFromData(ARTICOLO_SEED, data)).toEqual([])
  })

  it('restituisce array vuoto per data vuoto', () => {
    expect(extractMediaKeysFromData(ARTICOLO_SEED, {})).toEqual([])
  })
})
