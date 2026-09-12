// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { Seed } from '@beechcms/core'
import { generateSeedTypes, computeSchemaFingerprint } from '@beechcms/core'

vi.mock('../lib/wrangler.js', () => ({
  queryD1: vi.fn(),
  findWranglerConfig: vi.fn(() => '/fake/wrangler.jsonc'),
  resolveDbName: vi.fn(() => 'beech-db'),
  getLocalD1SqlitePath: vi.fn(() => '/fake/state.sqlite'),
}))

import { queryD1, getLocalD1SqlitePath } from '../lib/wrangler.js'
import { typesCheck } from '../commands/types-check.js'

const ARTICLES_SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { alias: 'body', label: 'Body', type: 'richtext' },
  ],
} as Seed

const SAMPLE_ROWS = [
  {
    slug: 'articles',
    definition: JSON.stringify(ARTICLES_SEED),
    status: 'active',
  },
]

describe('typesCheck command', () => {
  const outDir = resolve(tmpdir(), `beech-types-check-test-${Date.now()}`)
  const outPath = resolve(outDir, 'beech-types.ts')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(queryD1).mockReturnValue(SAMPLE_ROWS)
    vi.mocked(getLocalD1SqlitePath).mockReturnValue('/fake/state.sqlite')
    mkdirSync(outDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
  })

  it('passes without writing when the committed file matches live D1', async () => {
    const fingerprint = await computeSchemaFingerprint([ARTICLES_SEED])
    writeFileSync(outPath, generateSeedTypes([ARTICLES_SEED], { fingerprint }), 'utf-8')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await typesCheck({ out: outPath, local: true })

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('matches live D1'))
  })

  it('exits with code 1 when the committed file is stale', async () => {
    writeFileSync(outPath, 'export interface Stale {}\n', 'utf-8')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(typesCheck({ out: outPath, local: true })).rejects.toThrow('exit:1')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('is stale'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with code 1 when the committed file does not exist', async () => {
    const missingPath = resolve(outDir, 'missing.ts')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(typesCheck({ out: missingPath, local: true })).rejects.toThrow('exit:1')

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with code 1 when local SQLite database file is missing in local mode', async () => {
    vi.mocked(getLocalD1SqlitePath).mockReturnValue(null)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(typesCheck({ out: outPath, local: true })).rejects.toThrow('exit:1')

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Local D1 database state not found'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
