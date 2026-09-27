// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { validateAndSanitizeSeedPayload } from './index.js'
import type { LocaleConfig } from '../localization.js'
import type { Seed } from '../types.js'

const CONFIG: LocaleConfig = { locales: ['it', 'en', 'pt-BR'], defaultLocale: 'it' }

const LOCALIZED_SEED: Seed = {
  slug: 'products',
  label: 'Product',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true },
    { id: 'br_body', alias: 'body', label: 'Body', type: 'richtext', localized: true },
    { id: 'br_meta', alias: 'meta', label: 'Meta', type: 'json', localized: true },
    { id: 'br_code', alias: 'code', label: 'Code', type: 'text' },
  ],
}

const SAFE_DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Scarpa' }] }] }
const DANGEROUS_DOC = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{
      type: 'text',
      text: 'click me',
      marks: [{ type: 'link', attrs: { href: 'javascript:alert(document.cookie)' } }],
    }],
  }],
}

describe('validateAndSanitizeSeedPayload — localized branches', () => {
  it('wraps a plain string under the default locale', () => {
    const result = validateAndSanitizeSeedPayload(LOCALIZED_SEED, { title: 'Scarpa' }, { localeConfig: CONFIG })

    expect(result.data.title).toEqual({ it: 'Scarpa' })
    expect(result.details).toEqual([])
  })

  it('accepts a dictionary and drops unregistered locales', () => {
    const result = validateAndSanitizeSeedPayload(
      LOCALIZED_SEED,
      { title: { it: 'Scarpa', en: 'Shoe', de: 'Schuh' } },
      { localeConfig: CONFIG },
    )

    expect(result.data.title).toEqual({ it: 'Scarpa', en: 'Shoe' })
  })

  it('marks a blank translation as a null clear-marker', () => {
    const result = validateAndSanitizeSeedPayload(
      LOCALIZED_SEED,
      { title: { it: 'Scarpa', en: '' } },
      { localeConfig: CONFIG },
    )

    expect(result.data.title).toEqual({ it: 'Scarpa', en: null })
  })

  it('reports a per-locale type error at alias.locale', () => {
    const result = validateAndSanitizeSeedPayload(
      LOCALIZED_SEED,
      { title: { it: 'Scarpa', en: 42 } },
      { localeConfig: CONFIG },
    )

    expect(result.details).toContainEqual(expect.objectContaining({ field: 'title.en', expected: 'string' }))
    expect(result.data).not.toHaveProperty('title')
  })

  it('reports a plain-value type error at the alias itself', () => {
    const result = validateAndSanitizeSeedPayload(LOCALIZED_SEED, { title: 42 }, { localeConfig: CONFIG })

    expect(result.details).toContainEqual(expect.objectContaining({ field: 'title', expected: 'string' }))
  })

  it('flags dangerous richtext in one translation as alias.locale', () => {
    const result = validateAndSanitizeSeedPayload(
      LOCALIZED_SEED,
      { title: 'Scarpa', body: { it: SAFE_DOC, en: DANGEROUS_DOC } },
      { localeConfig: CONFIG },
    )

    expect(result.dangerousFields).toEqual(['body.en'])
  })

  it('satisfies requiredOnCreate with the default locale alone', () => {
    const result = validateAndSanitizeSeedPayload(
      LOCALIZED_SEED,
      { title: { it: 'Scarpa' } },
      { localeConfig: CONFIG },
    )

    expect(result.requiredFieldsMissing).toEqual([])
  })

  it('reports requiredOnCreate when only a non-default locale is provided', () => {
    const result = validateAndSanitizeSeedPayload(
      LOCALIZED_SEED,
      { title: { en: 'Shoe' } },
      { localeConfig: CONFIG },
    )

    expect(result.requiredFieldsMissing).toEqual(['title'])
  })

  it('treats localized branches as their base type when no localeConfig is passed', () => {
    const result = validateAndSanitizeSeedPayload(LOCALIZED_SEED, { title: { it: 'x' } })

    expect(result.details).toContainEqual(expect.objectContaining({ field: 'title', expected: 'string' }))
  })

  it('returns null for an explicit null when allowNull is true', () => {
    const result = validateAndSanitizeSeedPayload(
      LOCALIZED_SEED,
      { title: null },
      { localeConfig: CONFIG, allowNull: true, enforceRequiredFields: false },
    )

    expect(result.data.title).toBeNull()
  })

  it('leaves non-localized branches untouched', () => {
    const result = validateAndSanitizeSeedPayload(
      LOCALIZED_SEED,
      { title: 'Scarpa', code: { it: 'x' } },
      { localeConfig: CONFIG },
    )

    expect(result.details).toContainEqual(expect.objectContaining({ field: 'code', expected: 'string' }))
  })

  const REQUIRED_ON_UPDATE_SEED: Seed = {
    ...LOCALIZED_SEED,
    branches: [
      ...LOCALIZED_SEED.branches,
      { id: 'br_summary', alias: 'summary', label: 'Summary', type: 'text', localized: true, requiredOnUpdate: true },
    ],
  }

  it('satisfies requiredOnUpdate with an update that leaves the default locale untouched', () => {
    const result = validateAndSanitizeSeedPayload(
      REQUIRED_ON_UPDATE_SEED,
      { summary: { en: 'Shoe' } },
      { localeConfig: CONFIG, operation: 'update' },
    )

    expect(result.requiredFieldsMissing).toEqual([])
  })

  it('satisfies requiredOnUpdate when the branch is omitted entirely (patch semantics)', () => {
    // Dashboard's buildLocalizedPatch omits a localized branch completely when no locale was
    // touched in the edit session — this must not trip requiredOnUpdate for untouched fields.
    const result = validateAndSanitizeSeedPayload(
      REQUIRED_ON_UPDATE_SEED,
      { code: 'x' },
      { localeConfig: CONFIG, operation: 'update' },
    )

    expect(result.requiredFieldsMissing).toEqual([])
    // Regression: the compiled object schema must not mark a required localized branch as a
    // non-optional key on update either — otherwise Zod fails the whole payload's parse (because
    // the key is entirely absent) and every other submitted field is silently dropped from `data`,
    // surfacing only the generic "no valid fields" error with nothing to highlight in the editor.
    expect(result.data).toEqual({ code: 'x' })
    expect(result.hasAnyValidField).toBe(true)
    expect(result.details).toEqual([])
  })

  it('reports requiredOnUpdate when an update clears the default locale', () => {
    const result = validateAndSanitizeSeedPayload(
      REQUIRED_ON_UPDATE_SEED,
      { summary: { it: '' } },
      { localeConfig: CONFIG, operation: 'update' },
    )

    expect(result.requiredFieldsMissing).toEqual(['summary'])
  })
})
