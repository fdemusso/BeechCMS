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
}

export interface ISiteSettingsRepository {
  /** Returns all stored settings, applying sensible defaults for missing keys. */
  getAll(): Promise<SiteSettings>
  /** Upserts the provided keys. Partial update — unspecified keys are untouched. */
  setMany(values: Partial<SiteSettings>): Promise<void>
}
