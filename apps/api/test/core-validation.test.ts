import { describe, expect, it } from 'vitest'
import { getSeed, isValidContentStatus, validateAndSanitizeSeedPayload } from '@beech/core'
import { sanitizePublicPayload } from '../src/public/sanitize'
import { generateEntrySlug, slugify } from '../src/public/slug-utils'
import { parseLatestCount, parsePublicPagination } from '../src/public/query-builder'
import { buildPublicListMeta, buildPublicSingleMeta } from '../src/public/response-builder'

describe('core validation foundation', () => {
  it('sanitizza e valida payload seed-aware', () => {
    const seed = getSeed('articoli')
    if (!seed) throw new Error('Seed articoli non trovato')

    const result = validateAndSanitizeSeedPayload(seed, {
      title: '  Ciao\u0001 ',
      publishedAt: '2026-04-07',
      invalidAlias: 'x',
    })

    expect(result.data.title).toBe('Ciao')
    expect(result.data.publishedAt).toBe('2026-04-07')
    expect(result.unknownAliases).toEqual(['invalidAlias'])
    expect(result.details).toEqual([])
  })

  it('raccoglie errori tipo per valori incompatibili', () => {
    const seed = getSeed('prodotti')
    if (!seed) throw new Error('Seed prodotti non trovato')

    const result = validateAndSanitizeSeedPayload(seed, {
      price: 'oops',
      active: 'yes',
    })

    expect(result.details).toHaveLength(2)
    expect(result.details[0].field).toBeDefined()
  })

  it('normalizza asset-list legacy in array URL', () => {
    const seed = getSeed('prodotti')
    if (!seed) throw new Error('Seed prodotti non trovato')

    const result = validateAndSanitizeSeedPayload(seed, {
      images: [
        { url: 'https://cdn.example.com/one.jpg' },
        'https://cdn.example.com/two.jpg',
      ],
    })

    expect(result.details).toEqual([])
    expect(result.data.images).toEqual([
      'https://cdn.example.com/one.jpg',
      'https://cdn.example.com/two.jpg',
    ])
  })

  it('segnala richtext pericoloso', () => {
    const seed = getSeed('articoli')
    if (!seed) throw new Error('Seed articoli non trovato')

    const result = validateAndSanitizeSeedPayload(seed, {
      body: '<p>safe</p><script>alert(1)</script>',
    })

    expect(result.dangerousFields).toEqual(['body'])
  })
})

describe('public sanitize adapter', () => {
  it('mappa dangerous richtext a 422', () => {
    const seed = getSeed('articoli')
    if (!seed) throw new Error('Seed articoli non trovato')

    const result = sanitizePublicPayload(seed, {
      body: '<p>ciao</p><iframe src="x"></iframe>',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(422)
    }
  })

  it('mappa errori validazione a 400 con details', () => {
    const seed = getSeed('prodotti')
    if (!seed) throw new Error('Seed prodotti non trovato')

    const result = sanitizePublicPayload(seed, {
      price: 'wrong',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.details).toBeDefined()
    }
  })

  it('accetta null quando allowNull e true', () => {
    const seed = getSeed('articoli')
    if (!seed) throw new Error('Seed articoli non trovato')

    const result = sanitizePublicPayload(
      seed,
      {
        metaTitle: null,
      },
      { allowNull: true }
    )

    expect(result.ok).toBe(true)
  })

  it('espone unknownAliases nel path di successo', () => {
    const seed = getSeed('articoli')
    if (!seed) throw new Error('Seed articoli non trovato')

    const result = sanitizePublicPayload(seed, {
      title: 'Titolo ok',
      notInSchema: 'x',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.unknownAliases).toEqual(['notInSchema'])
    }
  })
})

describe('public slug utils', () => {
  it('slugify normalizza in modo stabile', () => {
    expect(slugify('  Caffè & CMS 2026  ')).toBe('caffe-cms-2026')
  })

  it('generateEntrySlug usa fallback quando input non valido', () => {
    const slug = generateEntrySlug({ title: '   ' })
    expect(slug.length).toBeGreaterThan(0)
  })
})

describe('core status validator', () => {
  it('riconosce status validi', () => {
    expect(isValidContentStatus('draft')).toBe(true)
    expect(isValidContentStatus('archived')).toBe(false)
  })
})

describe('public query helpers', () => {
  it('parsePublicPagination applica default e clamp del limit', () => {
    expect(parsePublicPagination({})).toEqual({ page: 1, limit: 25 })
    expect(parsePublicPagination({ page: '2', limit: '500' })).toEqual({ page: 2, limit: 100 })
  })

  it('parseLatestCount applica clamp tra 1 e 100', () => {
    expect(parseLatestCount(undefined)).toBe(10)
    expect(parseLatestCount('0')).toBe(1)
    expect(parseLatestCount('101')).toBe(100)
    expect(parseLatestCount('7')).toBe(7)
  })
})

describe('public response helpers', () => {
  it('costruisce meta lista e singolo elemento nel formato atteso', () => {
    expect(
      buildPublicListMeta({
        total: 47,
        page: 2,
        limit: 25,
        returned: 25,
        seed: 'articoli',
      })
    ).toEqual({
      total: 47,
      page: 2,
      limit: 25,
      returned: 25,
      seed: 'articoli',
    })

    expect(buildPublicSingleMeta('prodotti')).toEqual({ seed: 'prodotti' })
  })
})

