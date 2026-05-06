import { describe, expect, it } from 'vitest'
import { isValidContentStatus, validateAndSanitizeSeedPayload } from '@beechcms/core'
import { sanitizePublicPayload } from '../src/public/sanitize'
import { generateEntrySlug, slugify } from '../src/public/slug-utils'
import { parseLatestCount, parsePublicPagination } from '../src/public/query-builder'
import { buildPublicListMeta, buildPublicSingleMeta } from '../src/public/response-builder'
import { TEST_SEEDS } from './fixtures'

const articoliSeed = TEST_SEEDS[0] // posts in fixtures

describe('core validation foundation', () => {
  it('sanitizza e valida payload seed-aware', () => {
    const result = validateAndSanitizeSeedPayload(articoliSeed, {
      title: '  Ciao\u0001 ',
      invalidAlias: 'x',
    })

    expect(result.data.title).toBe('Ciao')
    expect(result.unknownAliases).toEqual(['invalidAlias'])
    expect(result.details).toHaveLength(1)
    expect(result.details[0].field).toBe('invalidAlias')
  })

  it('segnala richtext pericoloso', () => {
    const result = validateAndSanitizeSeedPayload(articoliSeed, {
      body: '<p>safe</p><script>alert(1)</script>',
    })

    expect(result.dangerousFields).toEqual(['body'])
  })
})

describe('public sanitize adapter', () => {
  it('mappa dangerous richtext a 422', () => {
    const result = sanitizePublicPayload(articoliSeed, {
      body: '<p>ciao</p><iframe src="x"></iframe>',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(422)
    }
  })

  it('rifiuta alias sconosciuti nel path strict', () => {
    const result = sanitizePublicPayload(articoliSeed, {
      title: 'Titolo ok',
      notInSchema: 'x',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(JSON.stringify(result.details)).toContain('notInSchema')
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
        seed: 'posts',
      })
    ).toEqual({
      total: 47,
      page: 2,
      limit: 25,
      returned: 25,
      seed: 'posts',
    })

    expect(buildPublicSingleMeta('posts')).toEqual({ seed: 'posts' })
  })
})
