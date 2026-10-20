// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Seed, SchemaQueryExecutor } from '@beechcms/core'

vi.mock('../lib/d1-context.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/d1-context.js')>('../lib/d1-context.js')
  return { ...actual, createD1Context: vi.fn(), loadLiveSeeds: vi.fn(), exitWithError: vi.fn() }
})
vi.mock('../lib/wrangler.js', () => ({ executeD1File: vi.fn() }))

import { createD1Context, loadLiveSeeds, exitWithError } from '../lib/d1-context.js'
import { executeD1File } from '../lib/wrangler.js'
import { schemaMigrate } from '../commands/schema-migrate.js'

const executor: SchemaQueryExecutor = { all: () => Promise.resolve([]) }

const LEGACY: Seed = {
  slug: 'tickets',
  label: 'Ticket',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'status', label: 'Status', type: 'text', options: ['open', 'closed'] },
  ] as unknown as Seed['branches'],
}

const CURRENT: Seed = {
  ...LEGACY,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    {
      id: 'br_02', alias: 'status', label: 'Status', type: 'tags', multiple: false,
      options: [{ value: 'open', color: '#3b82f6' }, { value: 'closed', color: '#22c55e' }],
    },
  ],
}

const MANUAL: Seed = {
  ...LEGACY,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'score', label: 'Score', type: 'number', options: ['1'] },
  ] as unknown as Seed['branches'],
}

function arrange(...loads: Seed[][]): void {
  vi.mocked(createD1Context).mockReturnValue({ executor, options: { db: 'beech-db', local: true, configPath: '' } })
  const loader = vi.mocked(loadLiveSeeds)
  for (const seeds of loads) loader.mockResolvedValueOnce(seeds)
}

describe('schemaMigrate', () => {
  let exit: ReturnType<typeof vi.spyOn>
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('reports nothing to migrate and writes nothing when every seed already honours the contract', async () => {
    arrange([CURRENT])

    await schemaMigrate({ apply: true })

    expect(executeD1File).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Nothing to migrate'))
  })

  it('previews the plan without writing and exits 1 while work is pending', async () => {
    arrange([LEGACY])

    await schemaMigrate({})

    expect(executeD1File).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('single-choice tags'))
  })

  it('writes the statements in one batch when applying and finishes cleanly once the re-check is empty', async () => {
    arrange([LEGACY], [CURRENT])
    vi.mocked(executeD1File).mockReturnValue(true)

    await schemaMigrate({ apply: true })

    expect(executeD1File).toHaveBeenCalledTimes(1)
    const sql = vi.mocked(executeD1File).mock.calls[0][0]
    expect(sql).toContain('json_array(status)')
    expect(sql).toContain("id = 'registry_version'")
    expect(exit).not.toHaveBeenCalled()
  })

  it('refuses to apply a plan with only manual steps and exits 1 without writing', async () => {
    arrange([MANUAL])

    await schemaMigrate({ apply: true })

    expect(executeD1File).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('surfaces a failed write as an error instead of reporting success', async () => {
    arrange([LEGACY])
    vi.mocked(executeD1File).mockReturnValue(false)

    await schemaMigrate({ apply: true })

    expect(exitWithError).toHaveBeenCalledTimes(1)
  })
})
