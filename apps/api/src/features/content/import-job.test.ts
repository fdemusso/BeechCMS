// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { MAX_JOB_ERROR_SAMPLES, DEFAULT_IMPORT_CHUNK_ROWS } from '@beechcms/core'
import {
  appendErrorSamples,
  resolveImportChunkRows,
  resolveImportMaxBytes,
  toImportJobResponse,
  type ImportJobRecord,
  type ImportRowError,
} from './import-job'
import { DEFAULT_IMPORT_MAX_BYTES } from './constants'

describe('resolveImportMaxBytes', () => {
  const cases: Array<{ raw: string | undefined; expected: number }> = [
    { raw: undefined, expected: DEFAULT_IMPORT_MAX_BYTES },
    { raw: '', expected: DEFAULT_IMPORT_MAX_BYTES },
    { raw: 'abc', expected: DEFAULT_IMPORT_MAX_BYTES },
    { raw: '0', expected: DEFAULT_IMPORT_MAX_BYTES },
    { raw: '-5', expected: DEFAULT_IMPORT_MAX_BYTES },
    { raw: '1024', expected: 1024 },
  ]

  it('falls back to the default for every unset or unparseable binding, and parses a valid one', () => {
    for (const { raw, expected } of cases) {
      expect(resolveImportMaxBytes({ IMPORT_MAX_BYTES: raw })).toBe(expected)
    }
  })
})

describe('resolveImportChunkRows', () => {
  const cases: Array<{ raw: string | undefined; expected: number }> = [
    { raw: undefined, expected: DEFAULT_IMPORT_CHUNK_ROWS },
    { raw: '', expected: DEFAULT_IMPORT_CHUNK_ROWS },
    { raw: 'abc', expected: DEFAULT_IMPORT_CHUNK_ROWS },
    { raw: '0', expected: DEFAULT_IMPORT_CHUNK_ROWS },
    { raw: '-5', expected: DEFAULT_IMPORT_CHUNK_ROWS },
    { raw: '1024', expected: 1024 },
  ]

  it('falls back to the default for every unset or unparseable binding, and parses a valid one', () => {
    for (const { raw, expected } of cases) {
      expect(resolveImportChunkRows({ IMPORT_CHUNK_ROWS: raw })).toBe(expected)
    }
  })
})

describe('appendErrorSamples', () => {
  function makeErrors(count: number, offset = 0): ImportRowError[] {
    return Array.from({ length: count }, (_, index) => ({
      row: offset + index + 1,
      code: 'invalid_json',
      message: 'malformed',
    }))
  }

  it('appends up to the cap and stops there', () => {
    const existing = makeErrors(MAX_JOB_ERROR_SAMPLES - 1)
    const incoming = makeErrors(5, MAX_JOB_ERROR_SAMPLES - 1)

    const result = appendErrorSamples(existing, incoming)

    expect(result).toHaveLength(MAX_JOB_ERROR_SAMPLES)
  })

  it('leaves an already-full list untouched', () => {
    const existing = makeErrors(MAX_JOB_ERROR_SAMPLES)
    const incoming = makeErrors(3, MAX_JOB_ERROR_SAMPLES)

    const result = appendErrorSamples(existing, incoming)

    expect(result).toEqual(existing)
  })
})

describe('toImportJobResponse', () => {
  const record: ImportJobRecord = {
    id: 'job-1',
    targetSeed: 'posts',
    format: 'ndjson',
    objectKey: 'objects/secret-key.ndjson',
    state: 'completed',
    rowOffset: 5,
    insertedRows: 4,
    failedRows: 1,
    errors: [{ row: 3, code: 'validation_failed', message: 'title is required' }],
    createdBy: 'user-1',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_100,
    finishedAt: 1_700_000_100,
  }

  it('omits objectKey and createdBy — a contract a toMatchObject assertion would not catch a regression against', () => {
    const response = toImportJobResponse(record)

    expect(Object.keys(response).sort()).toEqual(
      ['createdAt', 'errors', 'failedRows', 'finishedAt', 'format', 'id', 'insertedRows', 'rowsRead', 'state', 'targetSeed', 'updatedAt'].sort(),
    )
  })

  it('renames rowOffset to rowsRead and passes the rest of the record through', () => {
    const response = toImportJobResponse(record)

    expect(response).toMatchObject({
      id: 'job-1',
      targetSeed: 'posts',
      format: 'ndjson',
      state: 'completed',
      rowsRead: 5,
      insertedRows: 4,
      failedRows: 1,
    })
  })
})
