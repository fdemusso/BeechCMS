// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { Seed } from '@beechcms/core'

vi.mock('../lib/wrangler.js', () => ({
  queryD1: vi.fn(),
  findWranglerConfig: vi.fn(() => '/fake/wrangler.jsonc'),
  resolveDbName: vi.fn(() => 'beech-db'),
  getLocalD1SqlitePath: vi.fn(() => '/fake/state.sqlite'),
}))

import { queryD1, getLocalD1SqlitePath } from '../lib/wrangler.js'
import { generateTypes } from '../commands/generate-types.js'

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

describe('generateTypes command', () => {
  const outDir = resolve(tmpdir(), `beech-gen-test-${Date.now()}`)
  const outPath = resolve(outDir, 'nested', 'beech-types.ts')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(queryD1).mockReturnValue(SAMPLE_ROWS)
    vi.mocked(getLocalD1SqlitePath).mockReturnValue('/fake/state.sqlite')
  })

  afterEach(() => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
  })

  it('writes output to file when out option is specified and creates directories', async () => {
    await generateTypes({ out: outPath, local: true })
    expect(existsSync(outPath)).toBe(true)
    const content = readFileSync(outPath, 'utf-8')
    expect(content).toContain('export interface Articles {')
    expect(content).toContain('export interface BeechDatabase {')
    expect(content).toContain('export type SeedRegistryTypes = BeechDatabase')
    expect(content).toContain('generato automaticamente')
  })

  it('embeds a v1 schema fingerprint in the generated module', async () => {
    await generateTypes({ out: outPath, local: true })

    const content = readFileSync(outPath, 'utf-8')
    expect(content).toMatch(/export const SCHEMA_FINGERPRINT = 'v1:[0-9a-f]{32}'/)
  })

  it('writes to stdout when out is null', async () => {
    let stdoutData = ''
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      stdoutData += chunk
      return true
    })

    await generateTypes({ out: null })
    expect(stdoutSpy).toHaveBeenCalled()
    expect(stdoutData).toContain('export interface Articles {')
    expect(stdoutData).toContain('export interface BeechDatabase {')
  })

  it('passes local and db options to queryD1', async () => {
    await generateTypes({ local: false, db: 'custom-db', out: outPath })
    expect(vi.mocked(queryD1)).toHaveBeenCalledWith(
      expect.stringContaining("SELECT slug, definition FROM seeds WHERE status = 'active'"),
      expect.objectContaining({ local: false, db: 'custom-db' })
    )
  })

  it('exits with code 1 when local SQLite database file is missing in local mode', async () => {
    vi.mocked(getLocalD1SqlitePath).mockReturnValue(null)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(generateTypes({ local: true })).rejects.toThrow('exit:1')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Local D1 database state not found'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with code 1 when seeds table is missing', async () => {
    vi.mocked(queryD1).mockImplementation(() => {
      throw new Error('no such table: seeds')
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(generateTypes({})).rejects.toThrow('exit:1')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('System table `seeds` not found in the database'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with code 1 on generic query error', async () => {
    vi.mocked(queryD1).mockImplementation(() => {
      throw new Error('connection timeout')
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(generateTypes({})).rejects.toThrow('exit:1')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to introspect D1 database'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with code 1 when active seeds table is empty', async () => {
    vi.mocked(queryD1).mockReturnValue([])
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(generateTypes({})).rejects.toThrow('exit:1')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No active seeds found in D1 database'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with code 1 when seed definition JSON is malformed', async () => {
    vi.mocked(queryD1).mockReturnValue([
      { slug: 'bad', definition: '{ invalid json' },
    ])
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(generateTypes({})).rejects.toThrow('exit:1')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to introspect D1 database'))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
