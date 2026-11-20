// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Longest slug derived from a label; the slug becomes part of a SQL table name (`content_{slug}`). */
const MAX_DERIVED_SLUG_LENGTH = 40

/** Letters NFD cannot split into base letter + accent, written out the way a reader would. */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "đ": "d", "ð": "d", "þ": "th", "ł": "l", "ħ": "h", "ı": "i",
}

/**
 * Derives a seed slug from a label: lowercase, accents stripped, apostrophes dropped (so "L'evento" is
 * `levento`, not `l_evento`), every other run of non-alphanumerics collapsed to one underscore.
 * The result satisfies `SLUG_RE` (`^[a-z0-9_]+$`) or is empty.
 */
export function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[ßæœøđðþłħı]/g, (ch) => TRANSLITERATIONS[ch] ?? ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’‘`´]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_DERIVED_SLUG_LENGTH)
    .replace(/_+$/g, "")
}

/**
 * Makes `base` unique among `taken` slugs by appending `_2`, `_3`, … The base is trimmed first when needed,
 * so the result never outgrows the derived length. An empty base stays empty.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!base || !taken.has(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `_${n}`
    const candidate = base.slice(0, MAX_DERIVED_SLUG_LENGTH - suffix.length).replace(/_+$/g, "") + suffix
    if (!taken.has(candidate)) return candidate
  }
}
