// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/localization
 * Field-level localization primitives for the Botanical Engine. A localized branch keeps its native
 * TEXT column and stores a locale dictionary in it (`{"it":"Scarpa","en":"Shoe"}`), so ids, relations
 * and metrics are untouched and toggling `Branch.localized` never emits DDL. Pure functions: no I/O and
 * no settings access — callers pass the project's {@link LocaleConfig}.
 */

import type { Branch, BranchType, Seed } from '../types.js'
import { cleanString, isPlainObject } from '../validation/primitives.js'

/**
 * Locale code grammar (v1): ISO 639 language (2–3 lowercase letters), optionally followed by an ISO 3166
 * region (2 uppercase letters) or a UN M.49 area (3 digits) — `it`, `en`, `pt-BR`, `es-419`. Script
 * subtags (`zh-Hant`) are outside v1. The grammar doubles as an injection guard: validated codes are
 * later interpolated into SQLite JSON paths.
 */
export const LOCALE_CODE_RE = /^[a-z]{2,3}(?:-(?:[A-Z]{2}|[0-9]{3}))?$/

/** Branch types that may carry `localized: true`. */
export const LOCALIZABLE_BRANCH_TYPES: ReadonlySet<BranchType> = new Set<BranchType>(['text', 'richtext', 'json'])

/**
 * Project-level language configuration. Invariant (guaranteed by its producer): `locales` is non-empty,
 * every entry matches {@link LOCALE_CODE_RE}, and it contains `defaultLocale`.
 */
export interface LocaleConfig {
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

/** A locale dictionary as stored in the branch column: locale code → value. */
export type LocalizedDictionary = Record<string, unknown>

/**
 * A validated write for a localized branch: registered locale code → new value, or `null` meaning
 * "clear this locale". Locales absent from the patch must be left untouched by the write path.
 */
export type LocalizedPatch = Record<string, unknown>

/** True when `value` is a string matching {@link LOCALE_CODE_RE}. */
export function isLocaleCode(value: unknown): value is string {
  return typeof value === 'string' && LOCALE_CODE_RE.test(value)
}

/**
 * True when the branch is localized AND its type supports it. A malformed definition that slipped past
 * seed validation (e.g. `localized: true` on a `number`) is treated as not localized, never as a dictionary.
 */
export function isLocalizedBranch(branch: Pick<Branch, 'type' | 'localized'>): boolean {
  return branch.localized === true && LOCALIZABLE_BRANCH_TYPES.has(branch.type)
}

/**
 * Structural check used on READ paths (no config available): a non-empty plain object whose every key
 * matches the locale-code grammar. A richtext envelope (`schemaVersion`, `doc`) and a TipTap doc
 * (`type`, `content`) never match.
 */
export function isLocaleDictionary(value: unknown): value is LocalizedDictionary {
  if (!isPlainObject(value)) return false
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every(isLocaleCode)
}

/**
 * Stricter check used on WRITE paths: a locale dictionary with at least one REGISTERED locale key.
 * Without the registration requirement a legitimate json value such as `{"url": "…", "alt": "…"}` —
 * whose keys happen to match the grammar — would be read as a dictionary of unregistered locales and
 * silently emptied.
 */
export function isLocalizedWriteDictionary(value: unknown, config: LocaleConfig): value is LocalizedDictionary {
  return isLocaleDictionary(value) && Object.keys(value).some((key) => config.locales.includes(key))
}

function isBlankLocaleValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && cleanString(value) === '')
}

/**
 * Normalises any accepted write value of a localized branch into a {@link LocalizedPatch}:
 * - a write dictionary keeps its registered locales, in `config.locales` order; unregistered locale
 *   keys are dropped;
 * - any other value (string, richtext doc, non-dictionary json) is the default-locale value;
 * - `null`, `undefined` and blank strings become `null` ("clear this locale").
 * Idempotent: a patch passed back in yields the same patch.
 */
export function toLocalizedPatch(value: unknown, config: LocaleConfig): LocalizedPatch {
  const source: Record<string, unknown> = isLocalizedWriteDictionary(value, config)
    ? value
    : { [config.defaultLocale]: value }
  const patch: LocalizedPatch = {}
  for (const locale of config.locales) {
    if (!Object.hasOwn(source, locale)) continue
    patch[locale] = isBlankLocaleValue(source[locale]) ? null : source[locale]
  }
  return patch
}

/**
 * Removes `null` / `undefined` / blank-string entries. Returns `null` when nothing remains, so an
 * all-cleared dictionary is stored as SQL NULL rather than `{}`. Keys are otherwise preserved as-is —
 * including locales no longer registered, which must never be dropped by a write (brief §2, no data loss).
 */
export function compactLocalizedDictionary(value: LocalizedDictionary): LocalizedDictionary | null {
  const compact: LocalizedDictionary = {}
  for (const [locale, localeValue] of Object.entries(value)) {
    if (isBlankLocaleValue(localeValue)) continue
    compact[locale] = localeValue
  }
  return Object.keys(compact).length > 0 ? compact : null
}

/**
 * The settings subset {@link resolveLocaleConfig} reads. Structural, so this module stays free of
 * settings imports; `SiteSettings` satisfies it.
 */
export interface LocaleSettings {
  readonly locales?: readonly string[] | null
  readonly defaultLocale?: string | null
  readonly defaultLanguage: string
}

/** Content locale used when neither stored `locales` nor a valid `defaultLanguage` is available. */
const FALLBACK_LOCALE = 'en'

/**
 * Builds the project's {@link LocaleConfig}, repairing whatever a hand-edited settings row could break so
 * the LocaleConfig invariant always holds:
 * - `locales`: the stored list minus invalid codes and duplicates; when nothing remains (never configured,
 *   `[]`, corrupt), the implicit single-language config `[defaultLanguage]` (brief §2), which keeps the
 *   feature invisible to a mono-lingual project;
 * - `defaultLocale`: the stored value when it belongs to `locales`, else `locales[0]`.
 */
export function resolveLocaleConfig(settings: LocaleSettings): LocaleConfig {
  const stored = [...new Set((settings.locales ?? []).filter(isLocaleCode))]
  const implicit = isLocaleCode(settings.defaultLanguage) ? settings.defaultLanguage : FALLBACK_LOCALE
  const locales = stored.length > 0 ? stored : [implicit]
  const defaultLocale = settings.defaultLocale && locales.includes(settings.defaultLocale)
    ? settings.defaultLocale
    : locales[0]
  return { locales, defaultLocale }
}

/**
 * True when a STORED value of a localized branch is a locale dictionary. Text and richtext cannot hold an
 * object keyed only by locale codes for any other reason; json can (`{"url": "…", "alt": "…"}`), so a json
 * object counts only when at least one key is a registered locale — otherwise it is a legacy value written
 * before the branch became localized.
 */
function isStoredLocaleDictionary(
  branch: Pick<Branch, 'type' | 'localized'>,
  value: unknown,
  config: LocaleConfig,
): value is LocalizedDictionary {
  if (!isLocalizedBranch(branch) || !isLocaleDictionary(value)) return false
  return branch.type !== 'json' || Object.keys(value).some((key) => config.locales.includes(key))
}

/**
 * Merges a write into the value stored for a localized branch. The write path's only way to persist a
 * localized value, so a translation the write does not mention is never dropped (brief §2):
 * - `write === null` clears the whole field (an explicit null keeps its pre-localization meaning);
 * - otherwise the write is normalised with {@link toLocalizedPatch}: every registered locale it names
 *   overwrites that locale, a `null` entry clears that locale only, and every other stored locale —
 *   including ones no longer registered — is kept as-is;
 * - a stored legacy value (written before the branch became localized) is the default-locale value.
 * @returns The compacted dictionary, or `null` when no locale keeps a value.
 */
export function applyLocalizedPatch(
  branch: Pick<Branch, 'type' | 'localized'>,
  stored: unknown,
  write: unknown,
  config: LocaleConfig,
): LocalizedDictionary | null {
  if (write === null) return null
  const merged: LocalizedDictionary = isStoredLocaleDictionary(branch, stored, config)
    ? { ...stored }
    : isBlankLocaleValue(stored) ? {} : { [config.defaultLocale]: stored }
  Object.assign(merged, toLocalizedPatch(write, config))
  return compactLocalizedDictionary(merged)
}

/** Aliases of the localized branches a write carries — the fields it must merge rather than replace. */
export function localizedAliasesIn(seed: Pick<Seed, 'branches'>, data: Record<string, unknown>): string[] {
  return seed.branches
    .filter((branch) => isLocalizedBranch(branch) && Object.hasOwn(data, branch.alias) && data[branch.alias] !== undefined)
    .map((branch) => branch.alias)
}

/**
 * Returns `data` with every localized branch it carries merged into `stored` via
 * {@link applyLocalizedPatch}; other keys pass through untouched. `stored` is the entry's current values
 * (`null` on create, which only compacts). Returns `data` itself when `config` is undefined or no localized
 * branch is written.
 */
export function mergeLocalizedFields(
  seed: Pick<Seed, 'branches'>,
  stored: Record<string, unknown> | null,
  data: Record<string, unknown>,
  config: LocaleConfig | undefined,
): Record<string, unknown> {
  if (!config) return data
  const aliases = localizedAliasesIn(seed, data)
  if (aliases.length === 0) return data
  const merged: Record<string, unknown> = { ...data }
  for (const branch of seed.branches) {
    if (!aliases.includes(branch.alias)) continue
    merged[branch.alias] = applyLocalizedPatch(branch, stored?.[branch.alias], data[branch.alias], config)
  }
  return merged
}

/**
 * Resolves a stored localized value to one language: the requested locale, then the default locale, then the
 * first stored translation (stored key order), then `null`. A legacy value that is not a dictionary is returned
 * as-is. Non-localized branches return `value` unchanged. `buildSelectQuery` applies the same chain in SQL, so
 * filters and ORDER BY compare exactly what a reader sees.
 */
export function resolveLocalizedValue(
  branch: Pick<Branch, 'type' | 'localized'>,
  value: unknown,
  locale: string,
  config: LocaleConfig,
): unknown {
  if (!isStoredLocaleDictionary(branch, value, config)) return value
  if (!isBlankLocaleValue(value[locale])) return value[locale]
  if (!isBlankLocaleValue(value[config.defaultLocale])) return value[config.defaultLocale]
  // An implicit config follows `defaultLanguage`; changing it before languages are configured leaves every
  // dictionary without its default key. Returning null there would blank the public site (brief §2).
  const firstStored = Object.values(value).find((translation) => !isBlankLocaleValue(translation))
  return firstStored ?? null
}

/**
 * Returns a copy of `data` with every localized branch resolved to `locale` (default: the default locale)
 * via {@link resolveLocalizedValue}. Returns `data` itself when `config` is undefined.
 */
export function resolveLocalizedFields(
  seed: Pick<Seed, 'branches'>,
  data: Record<string, unknown>,
  config: LocaleConfig | undefined,
  locale?: string,
): Record<string, unknown> {
  if (!config) return data
  const target = locale ?? config.defaultLocale
  const resolved: Record<string, unknown> = { ...data }
  for (const branch of seed.branches) {
    if (isLocalizedBranch(branch) && Object.hasOwn(resolved, branch.alias)) {
      resolved[branch.alias] = resolveLocalizedValue(branch, resolved[branch.alias], target, config)
    }
  }
  return resolved
}

/**
 * The whole dictionary of a stored localized value, for readers asking every language (`?lang=all`):
 * a stored dictionary as-is — unregistered locales included, nothing is hidden (brief §2) — a legacy
 * value as `{ [defaultLocale]: value }` (the write path's reading of it), a blank value as `null`.
 * Non-localized branches return `value` unchanged.
 */
export function asLocaleDictionary(
  branch: Pick<Branch, 'type' | 'localized'>,
  value: unknown,
  config: LocaleConfig,
): unknown {
  if (!isLocalizedBranch(branch)) return value
  if (isStoredLocaleDictionary(branch, value, config)) return value
  return isBlankLocaleValue(value) ? null : { [config.defaultLocale]: value }
}

/** Returns a copy of `data` with every localized branch it carries passed through {@link asLocaleDictionary}. */
export function asLocaleDictionaries(
  seed: Pick<Seed, 'branches'>,
  data: Record<string, unknown>,
  config: LocaleConfig,
): Record<string, unknown> {
  const expanded: Record<string, unknown> = { ...data }
  for (const branch of seed.branches) {
    if (isLocalizedBranch(branch) && Object.hasOwn(expanded, branch.alias)) {
      expanded[branch.alias] = asLocaleDictionary(branch, expanded[branch.alias], config)
    }
  }
  return expanded
}
