// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/wrangler.js', () => ({
  queryD1: vi.fn(),
  findWranglerConfig: vi.fn(() => '/fake/wrangler.jsonc'),
  resolveDbName: vi.fn(() => 'beech-db'),
  getLocalD1SqlitePath: vi.fn(() => '/fake/state.sqlite'),
}))
vi.mock('node:fs', () => ({ writeFileSync: vi.fn(), mkdirSync: vi.fn(), existsSync: vi.fn(() => true) }))

import { writeFileSync } from 'node:fs'
import { queryD1 } from '../lib/wrangler.js'
import { schemaExport } from '../commands/schema-export.js'

const ACTIVE_SEED_ROW = {
  slug: 'posts',
  definition: JSON.stringify({ slug: 'posts', label: 'Posts', displayNameAlias: 'title', branches: [] }),
  status: 'active',
}

describe('schemaExport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes beech.schema.ts containing every active seed', async () => {
    vi.mocked(queryD1).mockReturnValue([ACTIVE_SEED_ROW])

    await schemaExport({})

    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expect.stringMatching(/beech\.schema\.ts$/),
      expect.stringContaining('posts'),
      'utf-8',
    )
  })

  it('writes nothing and exits non-zero when the seeds table is missing', async () => {
    vi.mocked(queryD1).mockImplementation(() => {
      throw new Error('no such table: seeds')
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(schemaExport({})).rejects.toThrow('exit:1')

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled()
  })
})
