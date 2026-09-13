// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from 'vitest'
import { defineSeed, encodeCsvRow, exportColumns, toCsvCells, type ActorContext, type FilterGroup, type Seed } from '@beechcms/core'
import { CANONICAL_SEEDS } from '@beechcms/testing'
import { createContentExportStream } from './export-stream'

const CATEGORIES = CANONICAL_SEEDS.find((seed) => seed.slug === 'categories') as Seed

const MASKED_SEED = defineSeed({
  slug: 'masked_widgets',
  label: 'Masked Widget',
  labelPlural: 'Masked Widgets',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'secret', label: 'Secret', type: 'text', policies: { visibility: 'masked' } },
  ],
})

const AUTHENTICATED_ACTOR: ActorContext = { type: 'authenticated' }

const ROW_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
]

function categoryRow(id: string, name: string): Record<string, unknown> {
  return { id, slug: name, status: 'published', created_at: 1_700_000_000, updated_at: 1_700_000_000, name }
}

function stubRepository(pages: Array<Record<string, unknown>[]>) {
  const findMany = vi.fn()
  for (const page of pages) {
    findMany.mockResolvedValueOnce({ items: page, total: page.length })
  }
  return { findMany }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    output += decoder.decode(value, { stream: true })
  }
  output += decoder.decode()
  return output
}

describe('createContentExportStream', () => {
  it('CSV output begins with the exportColumns header row, CRLF-terminated, ahead of any data row', async () => {
    const repository = stubRepository([[categoryRow(ROW_IDS[0], 'Alpha')]])

    const output = await readAll(createContentExportStream({
      repository, seed: CATEGORIES, format: 'csv', actor: AUTHENTICATED_ACTOR, filters: [],
    }))

    const header = encodeCsvRow([...exportColumns(CATEGORIES)])
    expect(output.startsWith(header)).toBe(true)
    expect(output).toBe(header + encodeCsvRow(toCsvCells(categoryRow(ROW_IDS[0], 'Alpha'), exportColumns(CATEGORIES))))
  })

  it('NDJSON output carries no header, one JSON line per row', async () => {
    const rows = [categoryRow(ROW_IDS[0], 'Alpha'), categoryRow(ROW_IDS[1], 'Beta')]
    const repository = stubRepository([rows])

    const output = await readAll(createContentExportStream({
      repository, seed: CATEGORIES, format: 'ndjson', actor: AUTHENTICATED_ACTOR, filters: [],
    }))

    const lines = output.split('\n').filter(Boolean)
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toMatchObject({ id: ROW_IDS[0], name: 'Alpha' })
    expect(JSON.parse(lines[1])).toMatchObject({ id: ROW_IDS[1], name: 'Beta' })
  })

  it('keyset-paged producer emits every row once, in page order, threading the cursor filter forward', async () => {
    const pages = [
      [categoryRow(ROW_IDS[0], 'A'), categoryRow(ROW_IDS[1], 'B')],
      [categoryRow(ROW_IDS[2], 'C'), categoryRow(ROW_IDS[3], 'D')],
      [categoryRow(ROW_IDS[4], 'E')],
    ]
    const repository = stubRepository(pages)
    const callerFilters: FilterGroup[] = [{ column: 'status', type: 'select', conditions: [{ op: 'eq', value: 'published' }] }]

    const output = await readAll(createContentExportStream({
      repository, seed: CATEGORIES, format: 'ndjson', actor: AUTHENTICATED_ACTOR, filters: callerFilters, pageSize: 2,
    }))

    const emittedIds = output.split('\n').filter(Boolean).map((line) => (JSON.parse(line) as { id: string }).id)
    expect(emittedIds).toEqual(ROW_IDS)
    expect(repository.findMany).toHaveBeenCalledTimes(3)

    // Regression guard: LIMIT/OFFSET over the engine's default `ORDER BY created_at DESC`
    // (a non-unique, unix-second column) can repeat a row and drop another when a bulk
    // import lands thousands of rows inside one second. Keyset paging on `id ASC` removes
    // the ambiguity, so every call after the first must carry the cursor filter, ANDed
    // with (never replacing) the caller's own filter groups.
    for (const call of repository.findMany.mock.calls) {
      const options = call[1] as { orderBy: unknown; pagination: { offset: number } }
      expect(options.orderBy).toEqual({ column: 'id', dir: 'ASC' })
      expect(options.pagination.offset).toBe(0)
    }
    const secondCallFilters = repository.findMany.mock.calls[1][1].filters as FilterGroup[]
    expect(secondCallFilters).toEqual([
      ...callerFilters,
      { column: 'id', type: 'system', conditions: [{ op: 'gt', value: ROW_IDS[1] }] },
    ])
    const thirdCallFilters = repository.findMany.mock.calls[2][1].filters as FilterGroup[]
    expect(thirdCallFilters).toEqual([
      ...callerFilters,
      { column: 'id', type: 'system', conditions: [{ op: 'gt', value: ROW_IDS[3] }] },
    ])
  })

  it('a page shorter than pageSize ends the stream without a further round-trip', async () => {
    const repository = stubRepository([[categoryRow(ROW_IDS[0], 'A'), categoryRow(ROW_IDS[1], 'B')]])

    await readAll(createContentExportStream({
      repository, seed: CATEGORIES, format: 'ndjson', actor: AUTHENTICATED_ACTOR, filters: [], pageSize: 5,
    }))

    expect(repository.findMany).toHaveBeenCalledTimes(1)
  })

  it('an empty result set yields the CSV header alone, and an empty string for NDJSON', async () => {
    const csvOutput = await readAll(createContentExportStream({
      repository: stubRepository([[]]), seed: CATEGORIES, format: 'csv', actor: AUTHENTICATED_ACTOR, filters: [],
    }))
    const ndjsonOutput = await readAll(createContentExportStream({
      repository: stubRepository([[]]), seed: CATEGORIES, format: 'ndjson', actor: AUTHENTICATED_ACTOR, filters: [],
    }))

    expect(csvOutput).toBe(encodeCsvRow([...exportColumns(CATEGORIES)]))
    expect(ndjsonOutput).toBe('')
  })

  it('a masked branch value is masked in the emitted line, exactly as applyVisibility resolves it', async () => {
    const row = { id: ROW_IDS[0], slug: 'w', status: 'published', created_at: 1, updated_at: 1, title: 'Widget', secret: 'do-not-leak' }
    const repository = stubRepository([[row]])

    const output = await readAll(createContentExportStream({
      repository, seed: MASKED_SEED, format: 'ndjson', actor: AUTHENTICATED_ACTOR, filters: [],
    }))

    const emitted = JSON.parse(output.trim()) as { secret: string }
    expect(emitted.secret).toBe('••••••••')
  })

  it('a value containing a comma, a quote and a newline round-trips into one quoted CSV field', async () => {
    const row = categoryRow(ROW_IDS[0], 'Comma, "Quote"\nNewline')
    const repository = stubRepository([[row]])

    const output = await readAll(createContentExportStream({
      repository, seed: CATEGORIES, format: 'csv', actor: AUTHENTICATED_ACTOR, filters: [],
    }))

    const dataLine = output.slice(encodeCsvRow([...exportColumns(CATEGORIES)]).length)
    expect(dataLine).toBe(encodeCsvRow(toCsvCells(row, exportColumns(CATEGORIES))))
    expect(dataLine).toContain('"Comma, ""Quote""\nNewline"')
  })

  it('findMany rejecting on a later page surfaces as a rejected stream read, never a partial file', async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce({ items: [categoryRow(ROW_IDS[0], 'A')], total: 1 })
      .mockRejectedValueOnce(new Error('D1 unavailable'))

    const stream = createContentExportStream({
      repository: { findMany }, seed: CATEGORIES, format: 'ndjson', actor: AUTHENTICATED_ACTOR, filters: [], pageSize: 1,
    })

    await expect(readAll(stream)).rejects.toThrow('D1 unavailable')
  })
})
