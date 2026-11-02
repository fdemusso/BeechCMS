// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { CsvRowReader, encodeCsvRow, encodeCsvValue } from './csv.js'

describe('encodeCsvValue', () => {
  it('leaves a plain value unquoted', () => {
    const result = encodeCsvValue('plain')

    expect(result).toBe('plain')
  })

  it('quotes a value containing the delimiter', () => {
    const result = encodeCsvValue('a,b')

    expect(result).toBe('"a,b"')
  })

  it('quotes a value containing an embedded CRLF', () => {
    const result = encodeCsvValue('a\r\nb')

    expect(result).toBe('"a\r\nb"')
  })

  it('doubles an inner quote and wraps the field', () => {
    const result = encodeCsvValue('say "hi"')

    expect(result).toBe('"say ""hi"""')
  })

  it('encodes null as an empty field', () => {
    const result = encodeCsvValue(null)

    expect(result).toBe('')
  })
})

describe('encodeCsvValue — neutralizeFormulas', () => {
  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'prefixes a quote on a formula-like value %j',
    (value) => {
      const result = encodeCsvValue(value, { neutralizeFormulas: true })

      expect(result.replaceAll('"', '').startsWith("'")).toBe(true)
    },
  )

  it.each(['-5', '+5', '3.14', '-0.5'])('leaves the plain number %j untouched', (value) => {
    const result = encodeCsvValue(value, { neutralizeFormulas: true })

    expect(result).toBe(value)
  })

  it('still applies RFC 4180 quoting after the prefix', () => {
    const result = encodeCsvValue('=HYPERLINK("x","y")', { neutralizeFormulas: true })

    expect(result).toBe('"\'=HYPERLINK(""x"",""y"")"')
  })

  it('leaves a value that merely contains a trigger character mid-string alone', () => {
    const result = encodeCsvValue('a=b', { neutralizeFormulas: true })

    expect(result).toBe('a=b')
  })

  it('exports a formula-like value verbatim by default (format unchanged)', () => {
    const result = encodeCsvValue('=1+1')

    expect(result).toBe('=1+1')
  })

  it('applies to every cell of a row', () => {
    const result = encodeCsvRow(['ok', '=1+1', null], { neutralizeFormulas: true })

    expect(result).toBe("ok,'=1+1,\r\n")
  })
})

describe('CsvRowReader', () => {
  it('round-trips a row containing a comma, a quote, and an embedded newline', () => {
    const row = encodeCsvRow(['a,b', 'say "hi"', 'line1\nline2'])
    const reader = new CsvRowReader()

    const parsed = reader.push(row)

    expect(parsed).toEqual([['a,b', 'say "hi"', 'line1\nline2']])
  })

  it('treats a newline inside a quoted field as data, not a row break', () => {
    // Regression guard: a naive split('\n') parser would corrupt this into two rows.
    const reader = new CsvRowReader()

    const rows = reader.push('"line1\nline2",b\r\n')

    expect(rows).toEqual([['line1\nline2', 'b']])
  })

  it('parses an escaped double-quote inside a quoted field', () => {
    const reader = new CsvRowReader()

    const rows = reader.push('"say ""hi""",b\r\n')

    expect(rows).toEqual([['say "hi"', 'b']])
  })

  it('splits correctly when push() is called mid-quoted-field', () => {
    const reader = new CsvRowReader()

    const firstBatch = reader.push('"line1\nli')
    const secondBatch = reader.push('ne2",b\r\n')

    expect(firstBatch).toEqual([])
    expect(secondBatch).toEqual([['line1\nline2', 'b']])
  })

  it('end() flushes a final row with no trailing newline', () => {
    const reader = new CsvRowReader()
    reader.push('a,b')

    const remainder = reader.end()

    expect(remainder).toEqual([['a', 'b']])
  })

  it('hasUnterminatedQuote() is true for a file that ends inside an open quote', () => {
    // Checked before end(): end() calls completeRow(), which resets the in-quotes
    // state as part of flushing the trailing row.
    const reader = new CsvRowReader()

    const result = reader.push('"unterminated')

    expect(result).toEqual([])
    expect(reader.hasUnterminatedQuote()).toBe(true)
  })

  it('strips a leading BOM before parsing the first row', () => {
    const reader = new CsvRowReader()

    const rows = reader.push('\uFEFFa,b\r\n')

    expect(rows).toEqual([['a', 'b']])
  })
})
