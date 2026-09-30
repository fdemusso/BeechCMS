// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn(() => true) }
})
vi.mock('picocolors', () => ({ default: { cyan: (s: string) => s, red: (s: string) => s, yellow: (s: string) => s, dim: (s: string) => s } }))

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { pathToFileURL } from 'node:url'
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

  it('maps --tier e2e to turbo run test:e2e', async () => {
    await test({ tier: 'e2e' })

    expect(spawnSync).toHaveBeenCalledWith(
      'turbo',
      ['run', 'test:e2e'],
      expect.objectContaining({ stdio: 'inherit', shell: true })
    )
  })

  it('refuses --diff combined with the e2e tier and spawns nothing', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    try {
      await expect(test({ diff: true, tier: 'e2e' })).rejects.toThrow('process.exit called')

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

describe('scripts/lib/test-resources.mjs (local thermal budget)', () => {
  type Resources = { budget: number; turboConcurrency: number; vitestWorkers: number } | null
  type ResolveFn = (hw: { env: Record<string, string>; cpus?: number; totalMemGb?: number }) => Resources

  const load = async (): Promise<ResolveFn> => {
    const url = pathToFileURL(resolve(__dirname, '../../../../scripts/lib/test-resources.mjs')).href
    return ((await import(url)) as { resolveTestResources: ResolveFn }).resolveTestResources
  }

  it('caps a 16-thread/32GB desktop at half its CPUs split over two packages', async () => {
    const resolveTestResources = await load()

    const resources = resolveTestResources({ env: {}, cpus: 16, totalMemGb: 32 })

    expect(resources).toMatchObject({ budget: 8, turboConcurrency: 2, vitestWorkers: 4 })
  })

  it('lets memory bound an 8GB laptop below its CPU budget', async () => {
    const resolveTestResources = await load()

    const resources = resolveTestResources({ env: {}, cpus: 10, totalMemGb: 8 })

    expect(resources).toMatchObject({ budget: 4, turboConcurrency: 2, vitestWorkers: 2 })
  })

  it('never throttles on CI', async () => {
    const resolveTestResources = await load()

    const resources = resolveTestResources({ env: { CI: 'true' }, cpus: 4, totalMemGb: 16 })

    expect(resources).toBeNull()
  })

  it('honours explicit overrides', async () => {
    const resolveTestResources = await load()

    const resources = resolveTestResources({ env: { BEECH_TEST_WORKERS: '12', VITEST_MAX_WORKERS: '3' }, cpus: 16, totalMemGb: 32 })

    expect(resources).toMatchObject({ budget: 12, turboConcurrency: 2, vitestWorkers: 3 })
  })
})
