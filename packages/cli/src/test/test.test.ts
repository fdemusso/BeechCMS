// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn(() => true) }
})
vi.mock('picocolors', () => ({ default: { cyan: (s: string) => s, red: (s: string) => s, yellow: (s: string) => s } }))

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { test, RUNNABLE_TIERS } from '../commands/test.js'

describe('test command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 }) as SpawnSyncReturns<string>)
  })

  it('runs turbo run test when no flag is given', async () => {
    await test({})

    expect(spawnSync).toHaveBeenCalledWith(
      'turbo',
      ['run', 'test'],
      expect.objectContaining({ stdio: 'inherit', shell: true })
    )
  })

  it('maps --tier integration to turbo run test:integration', async () => {
    await test({ tier: 'integration' })

    expect(spawnSync).toHaveBeenCalledWith(
      'turbo',
      ['run', 'test:integration'],
      expect.objectContaining({ stdio: 'inherit', shell: true })
    )
  })

  it('runs one turbo task per tier for a comma-separated list', async () => {
    await test({ tier: 'unit,integration' })

    expect(spawnSync).toHaveBeenCalledWith(
      'turbo',
      ['run', 'test:unit', 'test:integration'],
      expect.objectContaining({ stdio: 'inherit', shell: true })
    )
  })

  it('forwards the tier list to the diff runner when --diff is combined with --tier', async () => {
    await test({ diff: true, tier: 'unit,integration' })

    expect(spawnSync).toHaveBeenCalledWith(
      'node',
      ['scripts/test-coverage-diff.mjs', '--tier', 'unit,integration'],
      expect.objectContaining({ stdio: 'inherit', shell: true })
    )
  })

  it('rejects an unknown tier with exit code 1 and spawns nothing', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    try {
      await expect(test({ tier: 'bogus' })).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(spawnSync).not.toHaveBeenCalled()
    } finally {
      mockExit.mockRestore()
    }
  })

  it('rejects the e2e tier, which has no runner yet', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    try {
      await expect(test({ tier: 'e2e' })).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(spawnSync).not.toHaveBeenCalled()
    } finally {
      mockExit.mockRestore()
    }
  })

  it('exposes the same runnable tiers as scripts/lib/test-tiers.mjs', () => {
    const source = readFileSync(resolve(__dirname, '../../../../scripts/lib/test-tiers.mjs'), 'utf8')
    const declared = source.match(/export const RUNNABLE_TIERS = \[([^\]]+)\]/)?.[1] ?? ''
    const names = [...declared.matchAll(/'([^']+)'/g)].map((m) => m[1])

    expect(names).toEqual([...RUNNABLE_TIERS])
  })
})
