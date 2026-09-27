// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface SiteSettings {
  siteTitle: string
  defaultLanguage: string
  timezone: string
  currency: string
  companyName: string | null
  companyWebsite: string | null
  companyAbbreviation: string | null
  /**
   * Content locales for field-level localization, in display order. `null` = never configured
   * (resolveLocaleConfig then falls back to `[defaultLanguage]`). Distinct from `defaultLanguage`,
   * which is the dashboard UI language.
   */
  locales: string[] | null
  /** Default content locale. `null` = never configured. */
  defaultLocale: string | null
}

export interface ISiteSettingsRepository {
  /** Returns all stored settings, applying sensible defaults for missing keys. */
  getAll(): Promise<SiteSettings>
  /** Upserts the provided keys. Partial update — unspecified keys are untouched. */
  setMany(values: Partial<SiteSettings>): Promise<void>
}
