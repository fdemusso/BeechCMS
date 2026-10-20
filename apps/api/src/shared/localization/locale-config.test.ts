// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from 'vitest'
import type { ISiteSettingsRepository, Seed, SiteSettings } from '@beechcms/core'
import { loadLocaleConfig } from './locale-config'

const NON_LOCALIZED_SEED: Pick<Seed, 'branches'> = {
  branches: [{ id: 'br_code', alias: 'code', label: 'Code', type: 'text' }],
}

const LOCALIZED_SEED: Pick<Seed, 'branches'> = {
  branches: [{ id: 'br_title', alias: 'title', label: 'Title', type: 'text', localized: true }],
}

const SETTINGS: SiteSettings = {
  siteTitle: 'Beech CMS',
  defaultLanguage: 'it',
  timezone: 'Europe/Rome',
  currency: 'EUR',
  companyName: null,
  companyWebsite: null,
  companyAbbreviation: null,
  locales: ['it', 'en'],
  defaultLocale: 'en',
}

describe('loadLocaleConfig', () => {
  it('returns undefined without reading settings for a seed with no localized branch', async () => {
    const getAll = vi.fn<ISiteSettingsRepository['getAll']>()

    const result = await loadLocaleConfig({ getAll }, NON_LOCALIZED_SEED)

    expect(result).toBeUndefined()
    expect(getAll).not.toHaveBeenCalled()
  })

  it('resolves the stored configuration for a seed with a localized branch', async () => {
    const getAll = vi.fn<ISiteSettingsRepository['getAll']>().mockResolvedValue(SETTINGS)

    const result = await loadLocaleConfig({ getAll }, LOCALIZED_SEED)

    expect(result).toEqual({ locales: ['it', 'en'], defaultLocale: 'en' })
  })
})
