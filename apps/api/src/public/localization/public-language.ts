// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module public/public-language
 * Response-language negotiation for the Public API: `?lang` → `Accept-Language` → the project default
 * locale, or every language with `?lang=all` / `?lang=*`. Active only when some seed has a localized branch;
 * otherwise nothing here reads settings, changes the cache key or adds a header.
 */

import type { Context } from 'hono'
import { asLocaleDictionaries, isLocaleCode, isLocalizedBranch, resolveLocaleConfig, resolveLocalizedFields } from '@beechcms/core'
import type { ISeedRegistry, ISiteSettingsRepository, LocaleConfig, Seed, SelectLocale } from '@beechcms/core'

export type PublicLanguage =
  | { readonly mode: 'single'; readonly locale: string; readonly config: LocaleConfig }
  | { readonly mode: 'all'; readonly config: LocaleConfig }

export type LanguageNegotiation =
  | { readonly ok: true; readonly language: PublicLanguage }
  | { readonly ok: false; readonly detail: string }

/** Query parameter that carries the resolved language in the edge-cache key. */
export const LANGUAGE_CACHE_PARAM = '__beech_lang'

const ALL_LANGUAGES = new Set(['all', '*'])
/** Bounds parsing work on a hostile header; browsers send a handful of entries. */
const MAX_ACCEPT_LANGUAGE_ENTRIES = 20

/** `EN-us` → `en-US`. Anything that is not `language[-region]` comes back trimmed for isLocaleCode to refuse. */
export function normalizeLanguageTag(raw: string): string {
  const trimmed = raw.trim()
  const parts = trimmed.split('-')
  if (parts.length === 1) return trimmed.toLowerCase()
  if (parts.length === 2) return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`
  return trimmed
}

/** RFC 4647 lookup, v1: the exact code, then its primary language subtag (`en-US` → `en`). */
function lookupLocale(tag: string, config: LocaleConfig): string | null {
  if (config.locales.includes(tag)) return tag
  const primary = tag.split('-')[0]
  return primary !== tag && config.locales.includes(primary) ? primary : null
}

/**
 * Accept-Language tags in preference order: q descending, header order among equals. Drops `*`, `q=0`,
 * malformed q-values and tags outside the locale grammar.
 */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return []
  return header
    .split(',')
    .slice(0, MAX_ACCEPT_LANGUAGE_ENTRIES)
    .map((part, index) => {
      const [rawTag, ...params] = part.split(';')
      const qParam = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
      const q = qParam === undefined ? 1 : Number(qParam.slice(2))
      return { tag: normalizeLanguageTag(rawTag), q, index }
    })
    .filter((entry) => isLocaleCode(entry.tag) && Number.isFinite(entry.q) && entry.q > 0 && entry.q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.tag)
}

/**
 * Picks the response language. A well-formed `?lang` the project does not register falls through to
 * Accept-Language and then the default, so a frontend's stale `.lang()` still renders; a malformed one is
 * refused, since it can only be a client bug.
 */
export function negotiatePublicLanguage(
  input: { readonly lang?: string | null; readonly acceptLanguage?: string | null },
  config: LocaleConfig,
): LanguageNegotiation {
  const requested = input.lang?.trim()
  if (requested) {
    if (ALL_LANGUAGES.has(requested.toLowerCase())) return { ok: true, language: { mode: 'all', config } }
    const tag = normalizeLanguageTag(requested)
    if (!isLocaleCode(tag)) {
      return { ok: false, detail: `'lang' must be a language code such as 'en' or 'pt-BR', or 'all'.` }
    }
    const locale = lookupLocale(tag, config)
    if (locale) return { ok: true, language: { mode: 'single', locale, config } }
  }
  for (const tag of parseAcceptLanguage(input.acceptLanguage ?? undefined)) {
    const locale = lookupLocale(tag, config)
    if (locale) return { ok: true, language: { mode: 'single', locale, config } }
  }
  return { ok: true, language: { mode: 'single', locale: config.defaultLocale, config } }
}

/** True when some seed has a localized branch — the only case where a public read depends on language. */
export function registryUsesLocalization(registry: Pick<ISeedRegistry, 'all'>): boolean {
  return registry.all().some((seed) => seed.branches.some(isLocalizedBranch))
}

/**
 * Negotiates the language of a public read, or `language: undefined` when no seed is localized (the response
 * cannot depend on language: no settings read, same cache key, no header — brief §4). The trigger is
 * registry-wide, not per-seed, because a non-localized seed can `?include` or subquery a localized one.
 * Uncached on purpose, like loadLocaleConfig: a version token would cost the same single D1 read.
 */
export async function loadPublicLanguage(input: {
  readonly registry: Pick<ISeedRegistry, 'all'>
  readonly settings: Pick<ISiteSettingsRepository, 'getAll'>
  readonly lang: string | undefined
  readonly acceptLanguage: string | undefined
}): Promise<{ readonly ok: true; readonly language: PublicLanguage | undefined } | { readonly ok: false; readonly detail: string }> {
  if (!registryUsesLocalization(input.registry)) return { ok: true, language: undefined }
  const config = resolveLocaleConfig(await input.settings.getAll())
  return negotiatePublicLanguage({ lang: input.lang, acceptLanguage: input.acceptLanguage }, config)
}

/** The `SelectOptions.locale` of a read: filters and sort compare in the default locale under `?lang=all`. */
export function selectLocaleOf(language: PublicLanguage | undefined): SelectLocale | undefined {
  if (!language) return undefined
  return { code: language.mode === 'single' ? language.locale : language.config.defaultLocale, config: language.config }
}

/** Resolves every localized field of `data` to the language — flat values, or full dictionaries in `all` mode. */
export function localizePublicEntry(
  seed: Pick<Seed, 'branches'>,
  data: Record<string, unknown>,
  language: PublicLanguage | undefined,
): Record<string, unknown> {
  if (!language) return data
  return language.mode === 'all'
    ? asLocaleDictionaries(seed, data, language.config)
    : resolveLocalizedFields(seed, data, language.config, language.locale)
}

/**
 * Edge-cache key of a read: the URL plus the resolved language. The Workers Cache API keys on the URL and
 * ignores `Vary: Accept-Language`, so two visitors with different headers would otherwise share one entry.
 */
export function languageCacheKey(request: Request, language: PublicLanguage | undefined): Request {
  if (!language) return request
  const url = new URL(request.url)
  url.searchParams.set(LANGUAGE_CACHE_PARAM, language.mode === 'all' ? '*' : language.locale)
  return new Request(url.toString(), { method: 'GET' })
}

/** `Vary` for downstream HTTP caches; `Content-Language` names the language a flat response resolved to. */
export function setLanguageHeaders(context: Context, language: PublicLanguage | undefined): void {
  if (!language) return
  context.header('Vary', 'Accept-Language', { append: true })
  if (language.mode === 'single') context.header('Content-Language', language.locale)
}
