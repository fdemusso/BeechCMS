// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1SiteSettingsRepository } from './site-settings.repository.d1'

function makeMockDb(allResults: unknown[] = []) {
  const batchMock = vi.fn().mockResolvedValue([])
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const bindMock = vi.fn().mockReturnValue({ all: allMock })
  const prepareMock = vi.fn().mockReturnValue({ bind: bindMock, all: allMock })
  const db = { prepare: prepareMock, batch: batchMock } as unknown as D1Database
  return { db, prepareMock, bindMock, batchMock, allMock }
}

describe('D1SiteSettingsRepository', () => {
  describe('getAll', () => {
    it('returns default values when site_settings table is empty', async () => {
      const { db } = makeMockDb([])
      const repo = new D1SiteSettingsRepository(db)

      const settings = await repo.getAll()

      expect(settings).toEqual({
        siteTitle: 'Beech CMS',
        defaultLanguage: 'en',
        timezone: 'Europe/Rome',
        currency: 'EUR',
        companyName: null,
        companyWebsite: null,
        companyAbbreviation: null,
      })
    })

    it('returns stored values from DB when present', async () => {
      const { db } = makeMockDb([
        { key: 'siteTitle', value: 'My Custom CMS' },
        { key: 'defaultLanguage', value: 'it' },
        { key: 'companyName', value: 'Acme Corp' },
      ])
      const repo = new D1SiteSettingsRepository(db)

      const settings = await repo.getAll()

      expect(settings.siteTitle).toBe('My Custom CMS')
      expect(settings.defaultLanguage).toBe('it')
      expect(settings.companyName).toBe('Acme Corp')
      expect(settings.companyWebsite).toBeNull()
    })
  })

  describe('setMany', () => {
    it('binds empty string instead of null to prevent NOT NULL constraint errors in D1', async () => {
      const { db, prepareMock, bindMock, batchMock } = makeMockDb([])
      const repo = new D1SiteSettingsRepository(db)

      await repo.setMany({
        siteTitle: 'New Title',
        companyName: null,
        companyWebsite: null,
      })

      expect(prepareMock).toHaveBeenCalledWith(
        'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      expect(bindMock).toHaveBeenCalledWith('siteTitle', 'New Title')
      expect(bindMock).toHaveBeenCalledWith('companyName', '')
      expect(bindMock).toHaveBeenCalledWith('companyWebsite', '')
      expect(batchMock).toHaveBeenCalledTimes(1)
    })

    it('does nothing when values is empty', async () => {
      const { db, batchMock } = makeMockDb([])
      const repo = new D1SiteSettingsRepository(db)

      await repo.setMany({})

      expect(batchMock).not.toHaveBeenCalled()
    })
  })
})
