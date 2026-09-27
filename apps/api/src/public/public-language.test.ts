// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from 'vitest'
import type { ISeedRegistry, ISiteSettingsRepository, LocaleConfig, Seed, SiteSettings } from '@beechcms/core'
import {
  languageCacheKey,
  loadPublicLanguage,
  negotiatePublicLanguage,
  parseAcceptLanguage,
} from './public-language'

const CONFIG: LocaleConfig = { locales: ['it', 'en', 'pt-BR'], defaultLocale: 'it' }

describe('negotiatePublicLanguage', () => {
  it('negotiates ?lang, then Accept-Language, then the default locale', () => {
    const cases: Array<[string | undefined, string | undefined, string]> = [
      ['en', undefined, 'en'],
      ['EN', undefined, 'en'],
      ['en-US', undefined, 'en'],
      ['pt-br', undefined, 'pt-BR'],
      ['fr', 'en', 'en'],
      ['fr', undefined, 'it'],
      ['all', 'en', 'all'],
      ['*', undefined, 'all'],
      [undefined, 'fr-CH, en;q=0.8', 'en'],
      [undefined, 'en;q=0.1, pt-BR;q=0.5, de;q=0', 'pt-BR'],
      [undefined, 'en;q=0', 'it'],
      [undefined, '*', 'it'],
      ['', 'en', 'en'],
      [undefined, undefined, 'it'],
    ]
    for (const [lang, acceptLanguage, expected] of cases) {
      const result = negotiatePublicLanguage({ lang, acceptLanguage }, CONFIG)

      expect(result.ok).toBe(true)
      if (result.ok) {
        const actual = result.language.mode === 'all' ? 'all' : result.language.locale
        expect(actual).toBe(expected)
      }
    }
  })

  it('refuses a malformed ?lang instead of falling back', () => {
    const malformed = ['en_US', 'e', 'english', "en'--", 'en-US-x']
    for (const lang of malformed) {
      const result = negotiatePublicLanguage({ lang, acceptLanguage: 'e' }, CONFIG)

      expect(result.ok).toBe(false)
    }
  })
})

describe('parseAcceptLanguage', () => {
  it('orders tags by q-value, keeps header order among equals and drops wildcards, q=0 and malformed tags', () => {
    const tags = parseAcceptLanguage('de;q=0.5, en, it;q=0.5, *;q=0.9, xx_YY, fr;q=0, es;q=abc')

    expect(tags).toEqual(['en', 'de', 'it'])
  })
})

describe('loadPublicLanguage', () => {
  it('returns no language and reads no settings when no seed is localized', async () => {
    // Regression guard: a mono-lingual project must pay no extra D1 read per public request.
    const registry: Pick<ISeedRegistry, 'all'> = {
      all: () => [{ slug: 'posts', label: 'Posts', displayNameAlias: 'title', branches: [] } as unknown as Seed],
    }
    const getAll = vi.fn<ISiteSettingsRepository['getAll']>()

    const result = await loadPublicLanguage({ registry, settings: { getAll }, lang: undefined, acceptLanguage: undefined })

    expect(result).toEqual({ ok: true, language: undefined })
    expect(getAll).not.toHaveBeenCalled()
  })

  it('resolves the stored configuration when any seed is localized, even if not the requested one', async () => {
    const nonLocalized = { slug: 'posts', label: 'Posts', displayNameAlias: 'title', branches: [] } as unknown as Seed
    const localized = {
      slug: 'products',
      label: 'Products',
      displayNameAlias: 'title',
      branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text', localized: true }],
    } as unknown as Seed
    const registry: Pick<ISeedRegistry, 'all'> = { all: () => [nonLocalized, localized] }
    const settings: SiteSettings = {
      siteTitle: 'Beech CMS',
      defaultLanguage: 'it',
      timezone: 'Europe/Rome',
      currency: 'EUR',
      companyName: null,
      companyWebsite: null,
      companyAbbreviation: null,
      locales: ['it', 'en'],
      defaultLocale: 'it',
    }
    const getAll = vi.fn<ISiteSettingsRepository['getAll']>().mockResolvedValue(settings)

    const result = await loadPublicLanguage({ registry, settings: { getAll }, lang: 'en', acceptLanguage: undefined })

    expect(result).toEqual({
      ok: true,
      language: { mode: 'single', locale: 'en', config: { locales: ['it', 'en'], defaultLocale: 'it' } },
    })
  })
})

describe('languageCacheKey', () => {
  it('adds the resolved language to the cache key and keeps every other query parameter', () => {
    const request = new Request('https://api.test/api/v1/public/products?limit=5')

    const single = languageCacheKey(request, { mode: 'single', locale: 'en', config: CONFIG })
    const all = languageCacheKey(request, { mode: 'all', config: CONFIG })

    expect(new URL(single.url).searchParams.get('__beech_lang')).toBe('en')
    expect(new URL(single.url).searchParams.get('limit')).toBe('5')
    expect(new URL(all.url).searchParams.get('__beech_lang')).toBe('*')
  })

  it('returns the request itself when the response is language-independent', () => {
    const request = new Request('https://api.test/api/v1/public/products')

    expect(languageCacheKey(request, undefined)).toBe(request)
  })
})
