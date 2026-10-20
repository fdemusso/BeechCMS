// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { ISiteSettingsRepository, SiteSettings } from '@beechcms/core'

const DEFAULTS: SiteSettings = {
  siteTitle: 'Beech CMS',
  defaultLanguage: 'en',
  timezone: 'Europe/Rome',
  currency: 'EUR',
  companyName: null,
  companyWebsite: null,
  companyAbbreviation: null,
  locales: null,
  defaultLocale: null,
}

/** A malformed stored array reads as "never configured" — resolveLocaleConfig then falls back safely. */
function parseLocales(raw: string | undefined): string[] | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((code) => typeof code === 'string') ? parsed : null
  } catch {
    return null
  }
}

export class D1SiteSettingsRepository implements ISiteSettingsRepository {
  constructor(private readonly db: D1Database) {}

  async getAll(): Promise<SiteSettings> {
    const { results } = await this.db
      .prepare('SELECT key, value FROM site_settings')
      .all<{ key: string; value: string }>()

    const map = new Map(results.map((r) => [r.key, r.value]))

    return {
      siteTitle: map.get('siteTitle') || DEFAULTS.siteTitle,
      defaultLanguage: map.get('defaultLanguage') || DEFAULTS.defaultLanguage,
      timezone: map.get('timezone') || DEFAULTS.timezone,
      currency: map.get('currency') || DEFAULTS.currency,
      companyName: map.get('companyName') || null,
      companyWebsite: map.get('companyWebsite') || null,
      companyAbbreviation: map.get('companyAbbreviation') || null,
      locales: parseLocales(map.get('locales')),
      defaultLocale: map.get('defaultLocale') || null,
    }
  }

  async setMany(values: Partial<SiteSettings>): Promise<void> {
    const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [string, string | string[] | null][]
    if (entries.length === 0) return

    const stmts = entries.map(([key, value]) =>
      this.db
        .prepare(
          'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        )
        .bind(key, Array.isArray(value) ? JSON.stringify(value) : (value ?? '')),
    )

    await this.db.batch(stmts)
  }
}
