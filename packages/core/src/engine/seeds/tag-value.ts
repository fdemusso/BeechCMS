// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { byteLength, stripControlChars } from '../validation/primitives.js'

/** Max tags stored in one `tags` field. Tags flag small things; more than this stops being a label set. */
export const TAG_MAX_COUNT = 10
/** Max user-perceived characters (grapheme clusters) in one tag, so one emoji or `é` counts as 1. */
export const TAG_MAX_LENGTH = 25
/** Hard UTF-8 byte ceiling per tag: bounds stacked combining marks ("zalgo") that fit in 25 graphemes. */
export const TAG_MAX_BYTES = 100
/** Max options a closed-vocabulary `tags` branch may declare. */
export const TAG_OPTIONS_MAX_COUNT = 50
/** Array size accepted before cleaning, so blanks the cleaner drops do not eat the real budget. */
export const TAG_RAW_MAX_COUNT = 50

/**
 * Invisible or layout-altering code points that render as nothing but make two tags differ:
 * C1 controls, soft hyphen, Mongolian vowel separator, zero-width space/non-joiner, LRM/RLM,
 * bidi embeddings and isolates (spoofing), word joiner and invisible operators, BOM, and the
 * Unicode "tag" block (invisible payloads). The zero-width joiner is handled by {@link STRAY_JOINER_RE}.
 */
const INVISIBLE_CHARS_RE = /[\u0080-\u009F\u00AD\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u{E0000}-\u{E007F}]/gu
/** Zero-width joiner not gluing two emoji pictographs; between two (family, profession emoji) it is meaningful and kept. */
const STRAY_JOINER_RE = /(?<!\p{Extended_Pictographic}\uFE0F?)\u200D|\u200D(?!\p{Extended_Pictographic})/gu
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
const UNICODE_WHITESPACE_RUN_RE = /\s+/g

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Why a tag value cannot be stored. */
export type TagValueRejection = 'ill-formed' | 'too-long'

/** Outcome of {@link normalizeTagValue}: the canonical value (possibly `''`), or why it was rejected. */
export type TagValueResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: TagValueRejection }

function graphemeCount(input: string): number {
  return [...graphemeSegmenter.segment(input)].length
}

/**
 * Canonical form of one tag, the single rule shared by payload validation, seed option validation and filters:
 * invisible and control characters removed (an emoji-gluing joiner survives), every whitespace run (tab, newline,
 * NBSP, line separator…) collapsed to one space, trimmed, Unicode NFC. Case is preserved (`Foo` ≠ `foo`).
 *
 * `ok: true` with `''` means the tag was blank after cleaning: callers decide whether to drop or reject it.
 * Rejected, never repaired: a lone UTF-16 surrogate (not valid UTF-8) and a value over
 * {@link TAG_MAX_LENGTH} characters or {@link TAG_MAX_BYTES} bytes. Pure, never throws.
 */
export function normalizeTagValue(raw: string): TagValueResult {
  if (LONE_SURROGATE_RE.test(raw)) return { ok: false, reason: 'ill-formed' }

  const value = stripControlChars(raw)
    .replaceAll(INVISIBLE_CHARS_RE, '')
    .replaceAll(STRAY_JOINER_RE, '')
    .replaceAll(UNICODE_WHITESPACE_RUN_RE, ' ')
    .trim()
    .normalize('NFC')

  if (byteLength(value) > TAG_MAX_BYTES || graphemeCount(value) > TAG_MAX_LENGTH) {
    return { ok: false, reason: 'too-long' }
  }
  return { ok: true, value }
}
