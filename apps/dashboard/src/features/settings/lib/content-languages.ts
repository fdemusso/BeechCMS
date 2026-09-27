// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isLocaleCode } from "@beechcms/core"

/** Mirrors `MAX_LOCALES` in apps/api/src/features/settings/settings.handler.ts. */
export const MAX_CONTENT_LANGUAGES = 50

export type AddContentLanguageError = "invalid" | "duplicate" | "limit"

export type AddContentLanguageResult =
  | { ok: true; locales: string[] }
  | { ok: false; error: AddContentLanguageError }

/** Appends a trimmed locale code. The grammar is core's (`it`, `en`, `pt-BR`, `es-419`); no case repair. */
export function addContentLanguage(locales: readonly string[], input: string): AddContentLanguageResult {
  const code = input.trim()
  if (!isLocaleCode(code)) return { ok: false, error: "invalid" }
  if (locales.includes(code)) return { ok: false, error: "duplicate" }
  if (locales.length >= MAX_CONTENT_LANGUAGES) return { ok: false, error: "limit" }
  return { ok: true, locales: [...locales, code] }
}

/** Removes `code`, except the default locale (the API requires `defaultLocale ∈ locales`). */
export function removeContentLanguage(locales: readonly string[], defaultLocale: string, code: string): string[] {
  return code === defaultLocale ? [...locales] : locales.filter((locale) => locale !== code)
}

/** The language's name in the UI language (`Intl.DisplayNames`), or the code itself when unavailable. */
export function contentLanguageName(code: string, uiLanguage: string): string {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}
