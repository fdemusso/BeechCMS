// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  asLocaleDictionary,
  isLocaleCode,
  isLocalizedBranch,
  isRichtextEnvelopeV1,
  type Branch,
  type LocaleConfig,
} from "@beechcms/core"

/**
 * @module entry-editor/lib/localized-form
 * How the Entry Editor holds and saves localized branches. `formData` keeps each localized value as stored (a locale
 * dictionary, or a legacy plain value); these helpers read and write one locale of it through core `asLocaleDictionary`,
 * and turn the locales the editor touched into a core `LocalizedPatch`. Pure: no React, no I/O.
 */

/** Locales the editor changed, per localized branch alias. Only these reach the save payload (patch semantics). */
export type TouchedLocales = Readonly<Record<string, readonly string[]>>

/** Per-locale completion of an entry: how many of its localized branches hold a value in that locale. */
export interface LocaleCompletion {
  readonly filled: number
  readonly total: number
}

/** How one localized field looks in the active locale. */
export interface LocalizedFieldState {
  /** The active locale is blank but another stored locale is not: readers of this locale get a fallback. */
  readonly isMissing: boolean
  /** The default locale, when "Copy from default" applies (missing, not the default, default has a value); else `null`. */
  readonly copyFromLocale: string | null
}

/** A validation error as `PUT/POST /api/content…` return it (`errors[]`). */
export interface ApiFieldError {
  readonly field: string
  readonly message: string
}

function localizedBranchesOf(branches: readonly Branch[]): Branch[] {
  return branches.filter(isLocalizedBranch)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The stored value as a dictionary (legacy value → default locale, blank → `{}`), via core `asLocaleDictionary`. */
function dictionaryOf(branch: Branch, stored: unknown, config: LocaleConfig): Record<string, unknown> {
  const dictionary = asLocaleDictionary(branch, stored, config)
  return isRecord(dictionary) ? dictionary : {}
}

/** The json code editor emits text: parse it for the payload. Blank text is `null`; invalid text is returned as-is. */
function parseJsonText(branch: Pick<Branch, "type">, value: unknown): unknown {
  if (branch.type !== "json" || typeof value !== "string") return value
  if (!value.trim()) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

/** True for a TipTap doc (or v1 envelope) made only of paragraphs without content: the editor's empty state. */
function isBlankRichtextDoc(value: unknown): boolean {
  const doc = isRichtextEnvelopeV1(value) ? value.doc : value
  if (!isRecord(doc) || doc.type !== "doc") return false
  const nodes = Array.isArray(doc.content) ? doc.content : []
  return nodes.every((node) => isRecord(node) && node.type === "paragraph"
    && !(Array.isArray(node.content) && node.content.length > 0))
}

/**
 * True for the values the editor itself produces for an empty field: `null` / `undefined`, blank text, `{}` or blank
 * JSON text (json), and a doc of empty paragraphs (richtext). Deliberately structural: a doc holding only an image is
 * content, so a translation is never cleared because it has no text.
 */
export function isBlankEditorValue(branch: Pick<Branch, "type">, value: unknown): boolean {
  const parsed = parseJsonText(branch, value)
  if (parsed === null || parsed === undefined) return true
  if (typeof parsed === "string") return parsed.trim() === ""
  if (branch.type === "richtext") return isBlankRichtextDoc(parsed)
  if (branch.type === "json") return isRecord(parsed) && Object.keys(parsed).length === 0
  return false
}

/** The value of `locale` in a localized branch's stored value; a legacy value reads as the default locale. */
export function localeValue(branch: Branch, stored: unknown, locale: string, config: LocaleConfig): unknown {
  return dictionaryOf(branch, stored, config)[locale]
}

/** Writes `value` under `locale`, keeping every other stored locale, including unregistered ones (brief §2). */
export function withLocaleValue(
  branch: Branch,
  stored: unknown,
  locale: string,
  value: unknown,
  config: LocaleConfig,
): Record<string, unknown> {
  return { ...dictionaryOf(branch, stored, config), [locale]: value }
}

/** The form data the renderer shows: each localized branch replaced by its `locale` value; other values pass through. */
export function projectLocale(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  locale: string,
  config: LocaleConfig,
): Record<string, unknown> {
  const view: Record<string, unknown> = { ...formData }
  for (const branch of localizedBranchesOf(branches)) {
    if (Object.hasOwn(view, branch.alias)) view[branch.alias] = localeValue(branch, view[branch.alias], locale, config)
  }
  return view
}

/** Records that `locale` of `alias` was edited. Returns `touched` itself when already recorded. */
export function markTouched(touched: TouchedLocales, alias: string, locale: string): TouchedLocales {
  const locales = touched[alias] ?? []
  return locales.includes(locale) ? touched : { ...touched, [alias]: [...locales, locale] }
}

/**
 * The localized half of a save payload: per localized branch, only the registered locales the editor touched, as
 * `{ [locale]: value }`, with a blank value sent as `null` (clears that locale only). A branch with no touched
 * locale is omitted: a top-level `null` would clear every locale, and an untouched blank default (empty doc, `{}`)
 * would be stored as a translation and stop the fallback chain.
 */
export function buildLocalizedPatch(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  touched: TouchedLocales,
  config: LocaleConfig,
): Record<string, Record<string, unknown>> {
  const patch: Record<string, Record<string, unknown>> = {}
  for (const branch of localizedBranchesOf(branches)) {
    const locales = (touched[branch.alias] ?? []).filter((locale) => config.locales.includes(locale))
    if (locales.length === 0) continue
    const entry: Record<string, unknown> = {}
    for (const locale of locales) {
      const value = localeValue(branch, formData[branch.alias], locale, config)
      entry[locale] = isBlankEditorValue(branch, value) ? null : parseJsonText(branch, value)
    }
    patch[branch.alias] = entry
  }
  return patch
}

/** The first touched translation of a localized json branch holding text that is not valid JSON, or `null`. */
export function findInvalidLocalizedJson(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  touched: TouchedLocales,
  config: LocaleConfig,
): { label: string; locale: string } | null {
  for (const branch of localizedBranchesOf(branches)) {
    if (branch.type !== "json") continue
    for (const locale of touched[branch.alias] ?? []) {
      const value = localeValue(branch, formData[branch.alias], locale, config)
      if (typeof value !== "string" || !value.trim()) continue
      try {
        JSON.parse(value)
      } catch {
        return { label: branch.label, locale }
      }
    }
  }
  return null
}

/** For every registered locale, how many of the seed's localized branches hold a non-blank value in it. */
export function localeCompletion(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  config: LocaleConfig,
): Record<string, LocaleCompletion> {
  const localized = localizedBranchesOf(branches)
  const completion: Record<string, LocaleCompletion> = {}
  for (const locale of config.locales) {
    const filled = localized.filter(
      (branch) => !isBlankEditorValue(branch, localeValue(branch, formData[branch.alias], locale, config)),
    ).length
    completion[locale] = { filled, total: localized.length }
  }
  return completion
}

/** Fallback indicator state of every localized branch in `locale` (see {@link LocalizedFieldState}). */
export function localizedFieldStates(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  locale: string,
  config: LocaleConfig,
): Record<string, LocalizedFieldState> {
  const states: Record<string, LocalizedFieldState> = {}
  for (const branch of localizedBranchesOf(branches)) {
    const dictionary = dictionaryOf(branch, formData[branch.alias], config)
    const hasValue = (code: string) => !isBlankEditorValue(branch, dictionary[code])
    const isMissing = !hasValue(locale) && Object.keys(dictionary).some(hasValue)
    const canCopy = isMissing && locale !== config.defaultLocale && hasValue(config.defaultLocale)
    states[branch.alias] = { isMissing, copyFromLocale: canCopy ? config.defaultLocale : null }
  }
  return states
}

/**
 * Maps API validation errors to field aliases. A `<alias>.<locale>…` path on a localized branch (dictionary input,
 * `localizedSchema`) is shown on its field, prefixed by the upper-cased locale. Any other path is kept verbatim.
 */
export function foldFieldErrors(errors: readonly ApiFieldError[], branches: readonly Branch[]): Record<string, string> {
  const localizedAliases = new Set(localizedBranchesOf(branches).map((branch) => branch.alias))
  const mapped: Record<string, string> = {}
  for (const { field, message } of errors) {
    const [alias, locale] = field.split(".")
    if (localizedAliases.has(alias) && isLocaleCode(locale)) {
      mapped[alias] = `${locale.toUpperCase()}: ${message}`
    } else {
      mapped[field] = message
    }
  }
  return mapped
}
