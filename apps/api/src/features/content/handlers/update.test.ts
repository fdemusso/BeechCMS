// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { Seed, SiteSettings } from '@beechcms/core'
import type { AppEnv } from '../../../types'
import { contentCrudApp } from '../crud.router'

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
  trashRetentionDays: 14,
}

// The handler is mounted through the real router so the seed and body checks that precede it run too.
async function put(overrides: {
  body?: unknown
  ifMatchHeader?: string
} = {}) {
  const { body, ifMatchHeader } = overrides

  const update = vi.fn().mockResolvedValue(undefined)
  const app = new Hono<AppEnv>()
  app.use('*', async (context, next) => {
    context.set('getSeed', () => SEED)
    context.set('repository', { findById: vi.fn().mockResolvedValue({ ...CURRENT_ENTRY }), update, existsSlug: vi.fn().mockResolvedValue(false) } as never)
    context.set('siteSettingsRepository', { getAll: vi.fn().mockResolvedValue(SETTINGS) } as never)
    context.set('idGenerator', { uuid: () => 'gen-id' } as never)
    context.set('jwtPayload', { sub: 'user-1', email: 'user@x.test' } as never)
    context.set('activityLogger', { log: vi.fn() } as never)
    context.set('scheduler', { waitUntil: vi.fn() } as never)
    context.set('automationRunner', { run: vi.fn().mockResolvedValue(undefined) } as never)
    await next()
  })
  app.route('/api/content', contentCrudApp)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ifMatchHeader !== undefined) headers['If-Match'] = ifMatchHeader
  const response = await app.request('/api/content/articles/entry-1', { method: 'PUT', headers, body: JSON.stringify(body) })
  return { response, update }
}

describe('updateHandler — localized fields', () => {
  // Regression guard: the read-modify-write race. Without an implicit guard, a concurrent write
  // landing between the read and the update would silently drop the translation it wrote.
  it('merges a localized write into the stored dictionary and guards it with the stored updated_at', async () => {
    const { response, update } = await put({ body: { title: { en: 'Shoe' } } })

    expect(response.status).toBe(200)

    expect(update).toHaveBeenCalledWith(
      SEED,
      'entry-1',
      expect.objectContaining({ title: { it: 'Scarpa', en: 'Shoe' } }),
      'draft',
      expect.objectContaining({ ifMatch: 1700000000 }),
    )
  })

  it('keeps the client If-Match over the implicit guard', async () => {
    const { response, update } = await put({ body: { title: { en: 'Shoe' } }, ifMatchHeader: '"1699999999"' })

    expect(response.status).toBe(200)

    expect(update).toHaveBeenCalledWith(
      SEED,
      'entry-1',
      expect.objectContaining({ title: { it: 'Scarpa', en: 'Shoe' } }),
      'draft',
      expect.objectContaining({ ifMatch: 1699999999 }),
    )
  })

  it('adds no implicit guard to a write that touches no localized branch', async () => {
    const { response, update } = await put({ body: { code: 'Y' } })

    expect(response.status).toBe(200)

    expect(update).toHaveBeenCalledWith(
      SEED,
      'entry-1',
      expect.objectContaining({ code: 'Y' }),
      'draft',
      expect.objectContaining({ ifMatch: undefined }),
    )
  })
})
