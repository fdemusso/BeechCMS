// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { Seed, SiteSettings } from '@beechcms/core'
import { updateHandler } from './update'

vi.mock('../../../public/problem-details', () => ({
  publicProblem: vi.fn((_ctx, details) => ({ mockProblem: true, ...details })),
}))

const SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', label: 'Title', type: 'text', localized: true },
    { id: 'br_code', alias: 'code', label: 'Code', type: 'text' },
  ],
}

const CURRENT_ENTRY = {
  id: 'entry-1',
  slug: 'a',
  status: 'draft',
  updated_at: 1700000000,
  title: { it: 'Scarpa' },
  code: 'X',
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
  defaultLocale: 'it',
}

function makeContext(overrides: {
  body?: unknown
  ifMatchHeader?: string
} = {}) {
  const { body, ifMatchHeader } = overrides

  const update = vi.fn().mockResolvedValue(undefined)
  const jsonMock = vi.fn((data: unknown) => ({ json: data }))
  const ctx = {
    req: {
      param: vi.fn((key: string) => {
        if (key === 'slug') return 'articles'
        if (key === 'id') return 'entry-1'
        return undefined
      }),
      json: vi.fn().mockResolvedValue(body),
      header: vi.fn((key: string) => (key === 'If-Match' ? ifMatchHeader : undefined)),
    },
    get: vi.fn((key: string) => {
      if (key === 'getSeed') return () => SEED
      if (key === 'repository') return { findById: vi.fn().mockResolvedValue({ ...CURRENT_ENTRY }), update, existsSlug: vi.fn().mockResolvedValue(false) }
      if (key === 'siteSettingsRepository') return { getAll: vi.fn().mockResolvedValue(SETTINGS) }
      if (key === 'idGenerator') return { uuid: () => 'gen-id' }
      if (key === 'jwtPayload') return { sub: 'user-1', role: 'admin', email: 'user@x.test' }
      if (key === 'activityLogger') return { log: vi.fn() }
      if (key === 'scheduler') return { waitUntil: vi.fn() }
      if (key === 'automationRunner') return { run: vi.fn().mockResolvedValue(undefined) }
      return undefined
    }),
    json: jsonMock,
  }
  return { ctx, jsonMock, update }
}

describe('updateHandler — localized fields', () => {
  // Regression guard: the read-modify-write race. Without an implicit guard, a concurrent write
  // landing between the read and the update would silently drop the translation it wrote.
  it('merges a localized write into the stored dictionary and guards it with the stored updated_at', async () => {
    const { ctx, update } = makeContext({ body: { title: { en: 'Shoe' } } })

    await updateHandler(ctx as never)

    expect(update).toHaveBeenCalledWith(
      SEED,
      'entry-1',
      expect.objectContaining({ title: { it: 'Scarpa', en: 'Shoe' } }),
      'draft',
      expect.objectContaining({ ifMatch: 1700000000 }),
    )
  })

  it('keeps the client If-Match over the implicit guard', async () => {
    const { ctx, update } = makeContext({ body: { title: { en: 'Shoe' } }, ifMatchHeader: '"1699999999"' })

    await updateHandler(ctx as never)

    expect(update).toHaveBeenCalledWith(
      SEED,
      'entry-1',
      expect.objectContaining({ title: { it: 'Scarpa', en: 'Shoe' } }),
      'draft',
      expect.objectContaining({ ifMatch: 1699999999 }),
    )
  })

  it('adds no implicit guard to a write that touches no localized branch', async () => {
    const { ctx, update } = makeContext({ body: { code: 'Y' } })

    await updateHandler(ctx as never)

    expect(update).toHaveBeenCalledWith(
      SEED,
      'entry-1',
      expect.objectContaining({ code: 'Y' }),
      'draft',
      expect.objectContaining({ ifMatch: undefined }),
    )
  })
})
