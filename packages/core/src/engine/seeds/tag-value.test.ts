// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { normalizeTagValue, TAG_MAX_BYTES, TAG_MAX_LENGTH } from './tag-value.js'

const ZWSP = '\u200B'
const ZWJ = '\u200D'
const FAMILY = `👨${ZWJ}👩${ZWJ}👧${ZWJ}👦`

/** Value of an accepted tag; the assertion fails loudly when the tag was rejected instead. */
function accepted(raw: string): string {
  const result = normalizeTagValue(raw)
  if (!result.ok) throw new Error(`expected ${JSON.stringify(raw.slice(0, 20))} to be accepted, got ${result.reason}`)
  return result.value
}

describe('normalizeTagValue', () => {
  describe('length', () => {
    it('accepts a tag of exactly 25 characters and rejects 26 as too-long', () => {
      const atLimit = 'a'.repeat(TAG_MAX_LENGTH)

      const results = [normalizeTagValue(atLimit), normalizeTagValue(`${atLimit}a`)]

      expect(results).toEqual([{ ok: true, value: atLimit }, { ok: false, reason: 'too-long' }])
    })

    it('counts user-perceived characters, so 25 emoji fit and 26 do not', () => {
      const results = [normalizeTagValue('🔥'.repeat(25)), normalizeTagValue('🔥'.repeat(26))]

      expect(results.map((result) => result.ok)).toEqual([true, false])
    })

    it('counts a ZWJ family emoji as one character', () => {
      const result = normalizeTagValue(FAMILY)

      expect(result).toEqual({ ok: true, value: FAMILY })
    })

    // 25 family emoji are 25 graphemes but 700 bytes: only the byte ceiling stops them.
    it('rejects 25 ZWJ family emoji through the byte ceiling', () => {
      const result = normalizeTagValue(FAMILY.repeat(25))

      expect(result).toEqual({ ok: false, reason: 'too-long' })
    })

    // Stacked combining marks stay one grapheme however many there are.
    it('rejects a "zalgo" tag of one letter plus 200 combining marks', () => {
      const result = normalizeTagValue(`a${'\u0301'.repeat(200)}`)

      expect(result).toEqual({ ok: false, reason: 'too-long' })
    })

    it('keeps the byte ceiling at exactly 100 bytes (25 four-byte characters pass)', () => {
      const result = normalizeTagValue('𝒜'.repeat(25))

      expect(TAG_MAX_BYTES).toBe(100)
      expect(result.ok).toBe(true)
    })

    it('rejects a megabyte-long tag without scanning it as text', () => {
      const result = normalizeTagValue('x'.repeat(1_000_000))

      expect(result).toEqual({ ok: false, reason: 'too-long' })
    })

    it('measures length after cleaning, so padding and invisible characters do not count', () => {
      const padded = `${' '.repeat(40)}${ZWSP.repeat(40)}${'a'.repeat(TAG_MAX_LENGTH)}${ZWSP.repeat(40)}${' '.repeat(40)}`

      const value = accepted(padded)

      expect(value).toBe('a'.repeat(TAG_MAX_LENGTH))
    })
  })

  describe('invisible and control characters', () => {
    it('removes every invisible code point from the inside of a tag', () => {
      const invisible = [
        ZWSP, '\u200C', '\u200E', '\u200F', '\u202E', '\u202A', '\u2066', '\u2069',
        '\u2060', '\u00AD', '\uFEFF', '\u180E', '\u0085', '\u{E0067}',
      ]

      const values = invisible.map((char) => accepted(`ab${char}cd`))

      expect(values).toEqual(invisible.map(() => 'abcd'))
    })

    it('turns a tag made only of invisible characters into the empty string', () => {
      const value = accepted(`${ZWSP}\uFEFF\u202E${ZWJ}\u2060`)

      expect(value).toBe('')
    })

    it('removes ASCII control characters, including NUL and BEL', () => {
      const value = accepted('\u0000a\u0007b\u001Fc\u007F')

      expect(value).toBe('abc')
    })

    it('removes a ZWJ that does not glue two emoji, and keeps one that does', () => {
      const values = [accepted(`a${ZWJ}b`), accepted(`👩${ZWJ}💻`), accepted(`👩${ZWJ}`), accepted(`${ZWJ}💻`)]

      expect(values).toEqual(['ab', `👩${ZWJ}💻`, '👩', '💻'])
    })

    it('does not let a tag-block smuggled payload survive next to a flag emoji', () => {
      const smuggled = `🏳${'\u{E0068}\u{E0069}'}`

      const value = accepted(smuggled)

      expect(value).toBe('🏳')
    })
  })

  describe('whitespace', () => {
    it('collapses every whitespace kind inside a tag to a single space', () => {
      const raw = 'a \t\n\r\u00A0\u2003\u2028\u2029\u3000 b'

      const value = accepted(raw)

      expect(value).toBe('a b')
    })

    it('trims Unicode whitespace that String.trim alone would leave out of ASCII-only logic', () => {
      const value = accepted('\u00A0\u3000news\u2003')

      expect(value).toBe('news')
    })

    it('turns a whitespace-only tag into the empty string', () => {
      const value = accepted(' \t\n\u00A0\u3000 ')

      expect(value).toBe('')
    })

    it('does not re-introduce a double space when invisible characters sit between two spaces', () => {
      const value = accepted(`a ${ZWSP} b`)

      expect(value).toBe('a b')
    })
  })

  describe('Unicode normalization', () => {
    it('maps the decomposed and the composed form of \u00E9 to the same value', () => {
      const values = [accepted('cafe\u0301'), accepted('caf\u00E9')]

      expect(values[0]).toBe(values[1])
      expect(values[0]).toBe('caf\u00E9')
    })

    it('composes Hangul jamo and canonical-ordered marks', () => {
      const value = accepted('\u1100\u1161')

      expect(value).toBe('\uAC00')
    })

    it('keeps compatibility characters as they are (NFC, not NFKC)', () => {
      const value = accepted('\uFB01ne')

      expect(value).toBe('\uFB01ne')
    })
  })

  describe('malformed UTF-16', () => {
    it('rejects a lone high surrogate, a lone low surrogate and a swapped pair as ill-formed', () => {
      const raws = ['ab\uD83D', '\uDE00ab', '\uDE00\uD83D', 'a\uD83Dz']

      const results = raws.map((raw) => normalizeTagValue(raw))

      expect(results).toEqual(raws.map(() => ({ ok: false, reason: 'ill-formed' })))
    })

    it('accepts a correctly paired surrogate', () => {
      const result = normalizeTagValue('a😀b')

      expect(result).toEqual({ ok: true, value: 'a😀b' })
    })
  })

  describe('what is deliberately left alone', () => {
    it('preserves case, so Foo and foo stay two distinct tags', () => {
      const values = [accepted('Foo'), accepted('foo')]

      expect(values).toEqual(['Foo', 'foo'])
    })

    it('leaves markup, SQL and prototype-looking text literal (escaping is the output layer job)', () => {
      const raws = ['<b>x</b>', "'; DROP TABLE t;--", '__proto__', 'constructor', '%_\\']

      const values = raws.map((raw) => accepted(raw))

      expect(values).toEqual(raws)
    })
  })

  describe('robustness', () => {
    it('is idempotent on every adversarial input it accepts', () => {
      const raws = [
        `  e\u0301${ZWSP}  x `, FAMILY, `a${ZWJ}b`, '\u00A0\u3000', 'a\tb\nc', `\u202Eevil\u202C`, '\uFB01', '\u1100\u1161',
      ]

      const once = raws.map((raw) => accepted(raw))
      const twice = once.map((value) => accepted(value))

      expect(twice).toEqual(once)
    })

    it('handles 200k consecutive joiners and whitespace without blowing up', () => {
      const hostile = `${ZWJ.repeat(100_000)}${' '.repeat(100_000)}`

      const value = accepted(hostile)

      expect(value).toBe('')
    })

    it('never throws on the empty string', () => {
      const result = normalizeTagValue('')

      expect(result).toEqual({ ok: true, value: '' })
    })
  })
})
