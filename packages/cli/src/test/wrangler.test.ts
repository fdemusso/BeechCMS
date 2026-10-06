// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(), rmSync: vi.fn(), existsSync: vi.fn(() => false),
  readFileSync: vi.fn(), readdirSync: vi.fn(),
}))
vi.mock('node:os', () => ({ tmpdir: () => '/tmp/Mario Rossi' }))

import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { executeD1File, queryD1, resolveDbName } from '../lib/wrangler.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(spawnSync).mockReturnValue({
    pid: 1, output: [], stdout: '[{"success":true,"results":[{"value":1}]}]',
    stderr: '', status: 0, signal: null,
  })
})

describe('Wrangler D1 execution', () => {
  it.each([false, true])('file execution preserves spaced paths without a shell (local=%s)', (local) => {
    const options = { db: 'beech-db', local, configPath: '/Projects/my site/wrangler.jsonc' }

    const result = executeD1File('SELECT 1', options)

    expect(result).toBe(true)
    const [command, args, settings] = vi.mocked(spawnSync).mock.calls[0]
    expect(command).toBe(process.execPath)
    expect(args?.[0]).toMatch(/wrangler[/\\]bin[/\\]wrangler\.js$/)
    expect(args?.slice(1)).toEqual([
      'd1', 'execute', 'beech-db', '--file', expect.stringContaining(join('/tmp/Mario Rossi', 'beech-')),
      '--config', options.configPath, local ? '--local' : '--remote',
    ])
    expect(settings?.shell).toBe(false)
    expect(rmSync).toHaveBeenCalledWith(args?.[5])
  })

  it.each([false, true])('queries preserve spaced paths without a shell (local=%s)', (local) => {
    const options = { db: 'beech-db', local, configPath: '/Projects/my site/wrangler.jsonc' }

    const result = queryD1('SELECT 1 AS value', options)

    expect(result).toEqual([{ value: 1 }])
    const [command, args, settings] = vi.mocked(spawnSync).mock.calls[0]
    expect(command).toBe(process.execPath)
    expect(args?.[0]).toMatch(/wrangler[/\\]bin[/\\]wrangler\.js$/)
    expect(args?.slice(1)).toEqual([
      'd1', 'execute', 'beech-db', '--file', expect.stringContaining(join('/tmp/Mario Rossi', 'beech-')),
      '--json', '--config', options.configPath, local ? '--local' : '--remote',
    ])
    expect(settings?.shell).toBe(false)
    expect(rmSync).toHaveBeenCalledWith(args?.[5])
  })

  it.each([executeD1File, queryD1])('rejects shell syntax before spawning or writing SQL', (execute) => {
    const options = { db: 'x & echo injected', local: false, configPath: null }

    const result = () => execute('SELECT 1', options)

    expect(result).toThrow('Invalid D1 database name')
    expect(spawnSync).not.toHaveBeenCalled()
    expect(writeFileSync).not.toHaveBeenCalled()
  })
})

describe('resolveDbName', () => {
  it.each([
    ['wrangler.jsonc', '{"d1_databases":[{"database_name":"x & echo injected"}]}'],
    ['wrangler.toml', '[[d1_databases]]\ndatabase_name = "x & echo injected"'],
  ])('rejects invalid database names from %s instead of silently defaulting', (path, config) => {
    vi.mocked(readFileSync).mockReturnValue(config)

    const result = () => resolveDbName(path)

    expect(result).toThrow('Invalid D1 database name')
  })

  it.each(['beech-db', 'site_123', 'DB'])('accepts valid database name %s', (name) => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ d1_databases: [{ database_name: name }] }))

    const result = resolveDbName('wrangler.jsonc')

    expect(result).toBe(name)
  })
})
