// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  LOCALE_CODE_RE,
  isLocaleCode,
  isLocalizedBranch,
  isLocaleDictionary,
  isLocalizedWriteDictionary,
  toLocalizedPatch,
  compactLocalizedDictionary,
  resolveLocaleConfig,
  applyLocalizedPatch,
  localizedAliasesIn,
  mergeLocalizedFields,
  resolveLocalizedValue,
  resolveLocalizedFields,
  asLocaleDictionary,
  asLocaleDictionaries,
  type LocaleConfig,
} from './localization.js'
import type { Branch, BranchType, Seed } from './types.js'

const CONFIG: LocaleConfig = { locales: ['it', 'en', 'pt-BR'], defaultLocale: 'it' }

const TEXT_BRANCH: Pick<Branch, 'type' | 'localized'> = { type: 'text', localized: true }
const JSON_BRANCH: Pick<Branch, 'type' | 'localized'> = { type: 'json', localized: true }

describe('isLocaleCode', () => {
  it('accepts it, en, pt-BR and es-419 and rejects IT, en_US, zh-Hant, e and 4-letter codes', () => {
    const cases: Array<[string, boolean]> = [
      ['it', true],
      ['en', true],
      ['pt-BR', true],
      ['es-419', true],
      ['IT', false],
      ['en_US', false],
      ['zh-Hant', false],
      ['e', false],
      ['abcd', false],
    ]
    for (const [code, expected] of cases) {
      expect(isLocaleCode(code)).toBe(expected)
    }
    expect(LOCALE_CODE_RE.test('it')).toBe(true)
  })
})

describe('isLocalizedBranch', () => {
  it('is true only for localized text, richtext and json', () => {
    const allTypes: BranchType[] = [
      'text', 'number', 'boolean', 'json', 'date', 'richtext', 'file', 'tags', 'relation', 'repeater',
    ]
    const localizable = new Set<BranchType>(['text', 'richtext', 'json'])
    for (const type of allTypes) {
      expect(isLocalizedBranch({ type, localized: true })).toBe(localizable.has(type))
      expect(isLocalizedBranch({ type, localized: false })).toBe(false)
      expect(isLocalizedBranch({ type, localized: undefined })).toBe(false)
    }
  })
})

describe('isLocaleDictionary', () => {
  it('accepts an object whose every key is a locale code', () => {
    expect(isLocaleDictionary({ it: 'Scarpa', en: 'Shoe' })).toBe(true)
  })

  it('rejects an empty object, an array, a richtext envelope and a TipTap doc', () => {
    expect(isLocaleDictionary({})).toBe(false)
    expect(isLocaleDictionary(['it', 'en'])).toBe(false)
    expect(isLocaleDictionary({ schemaVersion: 1, doc: { type: 'doc', content: [] } })).toBe(false)
    expect(isLocaleDictionary({ type: 'doc', content: [] })).toBe(false)
  })
})

describe('isLocalizedWriteDictionary', () => {
  it('rejects a json value whose short keys match the grammar but name no registered locale', () => {
    expect(isLocalizedWriteDictionary({ url: 'https://x', alt: 'A' }, CONFIG)).toBe(false)
  })

  // Regression guard: without the registration requirement, a legitimate json value such as
  // { url, alt } would be read as a dictionary of unregistered locales and silently emptied.
  it('accepts a dictionary with at least one registered locale key', () => {
    expect(isLocalizedWriteDictionary({ it: 'Scarpa', xx: 'ignored' }, CONFIG)).toBe(true)
  })
})

describe('toLocalizedPatch', () => {
  it('wraps a plain string under the default locale', () => {
    expect(toLocalizedPatch('Scarpa', CONFIG)).toEqual({ it: 'Scarpa' })
  })

  it('keeps registered locales in config order and drops unregistered locale keys', () => {
    const patch = toLocalizedPatch({ en: 'Shoe', de: 'Schuh', it: 'Scarpa' }, CONFIG)
    expect(patch).toEqual({ it: 'Scarpa', en: 'Shoe' })
    expect(Object.keys(patch)).toEqual(['it', 'en'])
  })

  it('turns empty and whitespace-only locale values into null', () => {
    expect(toLocalizedPatch({ it: 'x', en: '  ' }, CONFIG)).toEqual({ it: 'x', en: null })
  })

  it('wraps a non-dictionary json object under the default locale', () => {
    expect(toLocalizedPatch({ url: 'u', alt: 'a' }, CONFIG)).toEqual({ it: { url: 'u', alt: 'a' } })
  })

  it('returns the same patch when applied to its own output', () => {
    const first = toLocalizedPatch({ it: 'Scarpa', en: 'Shoe' }, CONFIG)
    const second = toLocalizedPatch(first, CONFIG)
    expect(second).toEqual(first)
  })
})

describe('compactLocalizedDictionary', () => {
  it('drops null and blank entries but keeps unregistered locales', () => {
    expect(compactLocalizedDictionary({ it: 'x', en: null, de: 'y', fr: '' })).toEqual({ it: 'x', de: 'y' })
  })

  it('returns null when every entry is blank', () => {
    expect(compactLocalizedDictionary({ it: null, en: '', fr: undefined })).toBeNull()
  })
})

describe('resolveLocaleConfig', () => {
  it('falls back to [defaultLanguage] when locales were never configured', () => {
    const config = resolveLocaleConfig({ locales: null, defaultLocale: null, defaultLanguage: 'it' })

    expect(config).toEqual({ locales: ['it'], defaultLocale: 'it' })
  })

  it('drops invalid and duplicate codes and repairs a defaultLocale outside locales', () => {
    const config = resolveLocaleConfig({ locales: ['it', 'IT', 'en', 'it'], defaultLocale: 'de', defaultLanguage: 'en' })

    expect(config).toEqual({ locales: ['it', 'en'], defaultLocale: 'it' })
  })

  it('keeps a configured list and default', () => {
    const config = resolveLocaleConfig({ locales: ['en', 'it'], defaultLocale: 'it', defaultLanguage: 'en' })

    expect(config).toEqual({ locales: ['en', 'it'], defaultLocale: 'it' })
  })
})

describe('applyLocalizedPatch', () => {
  it('merges a locale into the stored dictionary and keeps the others', () => {
    const merged = applyLocalizedPatch(TEXT_BRANCH, { it: 'Scarpa' }, { en: 'Shoe' }, CONFIG)

    expect(merged).toEqual({ it: 'Scarpa', en: 'Shoe' })
  })

  it('clears one locale on a null entry', () => {
    const merged = applyLocalizedPatch(TEXT_BRANCH, { it: 'Scarpa', en: 'Shoe' }, { en: null }, CONFIG)

    expect(merged).toEqual({ it: 'Scarpa' })
  })

  it('treats a legacy plain value as the default locale', () => {
    const merged = applyLocalizedPatch(TEXT_BRANCH, 'Scarpa', { en: 'Shoe' }, CONFIG)

    expect(merged).toEqual({ it: 'Scarpa', en: 'Shoe' })
  })

  // Regression guard: removing a locale from settings must never drop its stored translations.
  it('keeps a locale no longer registered', () => {
    const merged = applyLocalizedPatch(TEXT_BRANCH, { it: 'a', de: 'b' }, 'c', CONFIG)

    expect(merged).toEqual({ it: 'c', de: 'b' })
  })

  // Regression guard: grammar-matching json keys are not locales.
  it('wraps a legacy json object under the default locale instead of merging into it', () => {
    const merged = applyLocalizedPatch(JSON_BRANCH, { url: 'u', alt: 'a' }, { en: { url: 'v' } }, CONFIG)

    expect(merged).toEqual({ it: { url: 'u', alt: 'a' }, en: { url: 'v' } })
  })

  it('returns null when the write clears the last locale', () => {
    const merged = applyLocalizedPatch(TEXT_BRANCH, { it: 'Scarpa' }, { it: null }, CONFIG)

    expect(merged).toBeNull()
  })

  it('returns null for an explicit null write', () => {
    const merged = applyLocalizedPatch(TEXT_BRANCH, { it: 'Scarpa', en: 'Shoe' }, null, CONFIG)

    expect(merged).toBeNull()
  })
})

describe('localizedAliasesIn', () => {
  it('lists only localized branches present with a defined value', () => {
    const seed: Pick<Seed, 'branches'> = {
      branches: [
        { id: 'br_title', alias: 'title', label: 'Title', type: 'text', localized: true },
        { id: 'br_code', alias: 'code', label: 'Code', type: 'text' },
        { id: 'br_summary', alias: 'summary', label: 'Summary', type: 'text', localized: true },
      ],
    }

    const aliases = localizedAliasesIn(seed, { title: { en: 'Shoe' }, code: 'X1', summary: undefined })

    expect(aliases).toEqual(['title'])
  })
})

describe('mergeLocalizedFields', () => {
  const seed: Pick<Seed, 'branches'> = {
    branches: [
      { id: 'br_title', alias: 'title', label: 'Title', type: 'text', localized: true },
      { id: 'br_code', alias: 'code', label: 'Code', type: 'text' },
    ],
  }

  it('merges localized aliases and passes other keys through', () => {
    const merged = mergeLocalizedFields(
      seed,
      { title: { it: 'Scarpa' }, code: 'X0' },
      { title: { en: 'Shoe' }, code: 'X1' },
      CONFIG,
    )

    expect(merged).toEqual({ title: { it: 'Scarpa', en: 'Shoe' }, code: 'X1' })
  })

  it('returns the same object when no config is passed', () => {
    const data = { title: { en: 'Shoe' }, code: 'X1' }

    const merged = mergeLocalizedFields(seed, null, data, undefined)

    expect(merged).toBe(data)
  })
})

describe('resolveLocalizedValue', () => {
  it('resolves the requested locale, then the default, then the first stored translation, and passes a legacy value through', () => {
    const cases: Array<[unknown, string, unknown]> = [
      [{ it: 'Scarpa', en: 'Shoe' }, 'en', 'Shoe'],
      [{ it: 'Scarpa' }, 'en', 'Scarpa'],
      [{ it: 'Scarpa', en: '' }, 'en', 'Scarpa'],
      ['Legacy', 'en', 'Legacy'],
      // Contract change (decision (c)): a dictionary missing both locales renders its first stored
      // translation instead of blanking.
      [{ de: 'Schuh' }, 'en', 'Schuh'],
      [{ en: '', de: 'Schuh' }, 'it', 'Schuh'],
    ]
    for (const [value, locale, expected] of cases) {
      expect(resolveLocalizedValue(TEXT_BRANCH, value, locale, CONFIG)).toEqual(expected)
    }
  })
})

describe('asLocaleDictionary', () => {
  it('returns stored dictionaries as-is, wraps a legacy value under the default locale and maps blank to null', () => {
    const cases: Array<[Pick<Branch, 'type' | 'localized'>, unknown, unknown]> = [
      [TEXT_BRANCH, { it: 'Scarpa', de: 'Schuh' }, { it: 'Scarpa', de: 'Schuh' }],
      [TEXT_BRANCH, 'Legacy', { it: 'Legacy' }],
      [TEXT_BRANCH, '', null],
      [TEXT_BRANCH, null, null],
      [JSON_BRANCH, { url: 'x' }, { it: { url: 'x' } }],
      [{ type: 'text', localized: false }, { it: 'x' }, { it: 'x' }],
    ]
    for (const [branch, value, expected] of cases) {
      expect(asLocaleDictionary(branch, value, CONFIG)).toEqual(expected)
    }
  })
})

describe('asLocaleDictionaries', () => {
  it('expands localized fields and leaves others untouched', () => {
    const seed: Pick<Seed, 'branches'> = {
      branches: [
        { id: 'br_title', alias: 'title', label: 'Title', type: 'text', localized: true },
        { id: 'br_code', alias: 'code', label: 'Code', type: 'text' },
      ],
    }

    const expanded = asLocaleDictionaries(seed, { title: 'Legacy', code: 'X1' }, CONFIG)

    expect(expanded).toEqual({ title: { it: 'Legacy' }, code: 'X1' })
  })
})

describe('resolveLocalizedFields', () => {
  it('resolves localized fields to the default locale and leaves others untouched', () => {
    const seed: Pick<Seed, 'branches'> = {
      branches: [
        { id: 'br_title', alias: 'title', label: 'Title', type: 'text', localized: true },
        { id: 'br_code', alias: 'code', label: 'Code', type: 'text' },
      ],
    }

    const resolved = resolveLocalizedFields(seed, { title: { it: 'Scarpa', en: 'Shoe' }, code: 'X1' }, CONFIG)

    expect(resolved).toEqual({ title: 'Scarpa', code: 'X1' })
  })
})
