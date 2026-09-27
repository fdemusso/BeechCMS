// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from 'vitest'
import type { ISiteSettingsRepository, LocaleConfig, Seed } from '@beechcms/core'
import { loadDisplayLocaleConfig, resolveDisplayName } from './display-name'

type DisplaySeed = Pick<Seed, 'branches' | 'displayNameAlias'>

const SEED_LOCALIZED_NON_DISPLAY: DisplaySeed = {
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_body', alias: 'body', label: 'Body', type: 'text', localized: true },
  ],
}

const SEED_PLAIN_DISPLAY: DisplaySeed = {
  displayNameAlias: 'title',
  branches: [{ id: 'br_title', alias: 'title', label: 'Title', type: 'text' }],
}

const SEED_LOCALIZED_DISPLAY: DisplaySeed = {
  displayNameAlias: 'title',
  branches: [{ id: 'br_title', alias: 'title', label: 'Title', type: 'text', localized: true }],
}

const CONFIG: LocaleConfig = { locales: ['it', 'en'], defaultLocale: 'it' }

describe('loadDisplayLocaleConfig', () => {
  it('returns undefined without reading settings when no seed has a localized display-name branch', async () => {
    const getAll = vi.fn<ISiteSettingsRepository['getAll']>()

    const result = await loadDisplayLocaleConfig({ getAll }, [SEED_LOCALIZED_NON_DISPLAY, SEED_PLAIN_DISPLAY])

    expect(result).toBeUndefined()
    expect(getAll).not.toHaveBeenCalled()
  })

  it("resolves the stored settings when one seed's display-name branch is localized", async () => {
    const getAll = vi.fn<ISiteSettingsRepository['getAll']>().mockResolvedValue({
      locales: ['it', 'en'],
      defaultLocale: 'en',
      defaultLanguage: 'it',
    })

    const result = await loadDisplayLocaleConfig({ getAll }, [SEED_LOCALIZED_NON_DISPLAY, SEED_LOCALIZED_DISPLAY])

    expect(result).toEqual({ locales: ['it', 'en'], defaultLocale: 'en' })
  })
})

describe('resolveDisplayName', () => {
  it('resolves raw and decoded display names to the default locale and leaves everything else untouched', () => {
    const cases: Array<{ seed: DisplaySeed; value: unknown; config: LocaleConfig | undefined; expected: unknown }> = [
      { seed: SEED_LOCALIZED_DISPLAY, value: '{"it":"Scarpa","en":"Shoe"}', config: CONFIG, expected: 'Scarpa' },
      { seed: SEED_LOCALIZED_DISPLAY, value: { it: 'Scarpa', en: 'Shoe' }, config: CONFIG, expected: 'Scarpa' },
      // First-translation fallback: 'it' (requested and default) is absent from the dictionary.
      { seed: SEED_LOCALIZED_DISPLAY, value: '{"en":"Shoe"}', config: CONFIG, expected: 'Shoe' },
      { seed: SEED_LOCALIZED_DISPLAY, value: 'Vecchio titolo', config: CONFIG, expected: 'Vecchio titolo' },
      { seed: SEED_LOCALIZED_DISPLAY, value: null, config: CONFIG, expected: null },
      { seed: SEED_PLAIN_DISPLAY, value: '{"it":"x"}', config: CONFIG, expected: '{"it":"x"}' },
      { seed: SEED_LOCALIZED_DISPLAY, value: '{"it":"Scarpa"}', config: undefined, expected: '{"it":"Scarpa"}' },
    ]

    for (const { seed, value, config, expected } of cases) {
      expect(resolveDisplayName(seed, value, config)).toEqual(expected)
    }
  })
})
