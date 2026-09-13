// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { encodeNdjsonLine, LineReader, parseNdjsonLine } from './ndjson.js'

describe('encodeNdjsonLine', () => {
  it('terminates the serialised record with a newline and round-trips through parseNdjsonLine', () => {
    const line = encodeNdjsonLine({ title: 'Hello', count: 3 })

    expect(line.endsWith('\n')).toBe(true)
    const decoded = parseNdjsonLine(line.slice(0, -1))
    expect(decoded).toEqual({ ok: true, record: { title: 'Hello', count: 3 } })
  })
})

describe('parseNdjsonLine', () => {
  it('reports invalid_json for a line that is not parseable JSON', () => {
    const result = parseNdjsonLine('{not json')

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.code).toBe('invalid_json')
  })

  const notObjectCases = ['[]', '"x"']

  it.each(notObjectCases)('reports not_an_object for %s', (line) => {
    const result = parseNdjsonLine(line)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.code).toBe('not_an_object')
  })
})

describe('LineReader', () => {
  it('reassembles a record split across two push() calls', () => {
    const reader = new LineReader()

    const firstBatch = reader.push('{"title":"Hel')
    const secondBatch = reader.push('lo"}\n')

    expect(firstBatch).toEqual([])
    expect(secondBatch).toEqual(['{"title":"Hello"}'])
  })

  it('drops blank lines and strips \\r from CRLF input', () => {
    const reader = new LineReader()

    const lines = reader.push('a\r\n\r\nb\r\n')

    expect(lines).toEqual(['a', 'b'])
  })

  it('strips a leading BOM from the first chunk only', () => {
    const reader = new LineReader()

    const lines = reader.push('\uFEFFa\n')

    expect(lines).toEqual(['a'])
  })

  it('end() yields the trailing unterminated line', () => {
    const reader = new LineReader()
    reader.push('a\nb')

    const remainder = reader.end()

    expect(remainder).toEqual(['b'])
  })
})
