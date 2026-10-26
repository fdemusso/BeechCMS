// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineSeed, EntryNotFoundError, type ContentRepository, type ISiteSettingsRepository, type Seed, type SiteSettings } from '@beechcms/core'
import {
  isRetentionSweepTick,
  runRetentionSweep,
  RETENTION_SWEEP_MAX_PURGES,
  type RetentionSweepDependencies,
} from './retention-sweep'

const NOW_SECONDS = 2_000_000

function makeSeed(slug: string, retentionDays?: number): Seed {
  return defineSeed({
    slug,
    label: slug,
    labelPlural: slug,
    displayNameAlias: 'title',
    ...(retentionDays !== undefined ? { retentionDays } : {}),
    branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
  })
}

function makeMediaSeed(slug: string): Seed {
  return defineSeed({
    slug,
    label: slug,
    labelPlural: slug,
    displayNameAlias: 'title',
    branches: [
      { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
      { id: 'br_02', alias: 'photo', label: 'Photo', type: 'file' },
    ],
  })
}

function idsFor(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`)
}

describe('isRetentionSweepTick', () => {
  it('is true at minutes 0 and 5 and false at minute 3', () => {
    const minuteZero = Date.UTC(2026, 4, 14, 9, 0)
    const minuteFive = Date.UTC(2026, 4, 14, 9, 5)
    const minuteThree = Date.UTC(2026, 4, 14, 9, 3)

    expect([minuteZero, minuteFive, minuteThree].map(isRetentionSweepTick)).toEqual([true, true, false])
  })
})

describe('runRetentionSweep', () => {
  const findExpiredByRetention = vi.fn<ContentRepository['findExpiredByRetention']>()
  const purge = vi.fn<ContentRepository['purge']>()
  const getAll = vi.fn<ISiteSettingsRepository['getAll']>()
  const bucketDelete = vi.fn<(key: string) => Promise<void>>()
  const getByKey = vi.fn()
  const untrack = vi.fn()
  const decrementStorage = vi.fn()
  let deps: RetentionSweepDependencies

  function settingsWith(trashRetentionDays: number): SiteSettings {
    return {
      siteTitle: 'Beech CMS',
      defaultLanguage: 'en',
      timezone: 'Europe/Rome',
      currency: 'EUR',
      companyName: null,
      companyWebsite: null,
      companyAbbreviation: null,
      locales: null,
      defaultLocale: null,
      trashRetentionDays,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getAll.mockResolvedValue(settingsWith(14))
    findExpiredByRetention.mockResolvedValue([])
    purge.mockImplementation(async (_seed, id) => ({ row: { id }, ledgerWritten: true }))
    bucketDelete.mockResolvedValue(undefined)
    getByKey.mockResolvedValue({ size_bytes: 10 })
    untrack.mockResolvedValue(undefined)
    decrementStorage.mockResolvedValue(undefined)
    deps = {
      repository: { findExpiredByRetention, purge } as unknown as ContentRepository,
      siteSettingsRepository: { getAll } as unknown as ISiteSettingsRepository,
      seeds: [],
      media: {
        var: {
          bucket: { delete: bucketDelete },
          mediaRepository: { getByKey, untrack },
          systemStatsRepository: { decrementStorage },
        },
      } as unknown as RetentionSweepDependencies['media'],
    }
  })

  it('queries a seed with no retentionDays with the global retention from settings', async () => {
    const seed = makeSeed('plain')
    deps.seeds = [seed]
    getAll.mockResolvedValue(settingsWith(7))

    await runRetentionSweep(deps, NOW_SECONDS)

    expect(findExpiredByRetention).toHaveBeenCalledWith(seed, 7, NOW_SECONDS, RETENTION_SWEEP_MAX_PURGES)
  })

  it('skips a seed with retentionDays 0 without any repository call', async () => {
    deps.seeds = [makeSeed('never', 0)]

    const result = await runRetentionSweep(deps, NOW_SECONDS)

    expect(result).toEqual({ purged: [], failed: [] })
    expect(findExpiredByRetention).not.toHaveBeenCalled()
    expect(purge).not.toHaveBeenCalled()
  })

  it('skips every seed without an override on global 0 and still sweeps a seed with retentionDays 30', async () => {
    const plain = makeSeed('plain')
    const overridden = makeSeed('overridden', 30)
    deps.seeds = [plain, overridden]
    getAll.mockResolvedValue(settingsWith(0))

    await runRetentionSweep(deps, NOW_SECONDS)

    expect(findExpiredByRetention).toHaveBeenCalledTimes(1)
    expect(findExpiredByRetention).toHaveBeenCalledWith(overridden, 30, NOW_SECONDS, RETENTION_SWEEP_MAX_PURGES)
  })

  it('purges each expired id with no actor and no trashed override', async () => {
    const seed = makeSeed('plain')
    deps.seeds = [seed]
    findExpiredByRetention.mockResolvedValue(['a', 'b'])

    const result = await runRetentionSweep(deps, NOW_SECONDS)

    expect(result.purged).toEqual([{ seedSlug: 'plain', id: 'a' }, { seedSlug: 'plain', id: 'b' }])
    expect(purge.mock.calls).toEqual([[seed, 'a'], [seed, 'b']])
  })

  it('reports a failing purge in failed and still purges the next id', async () => {
    deps.seeds = [makeSeed('plain')]
    findExpiredByRetention.mockResolvedValue(['a', 'b'])
    purge.mockRejectedValueOnce(new Error('ledger down'))

    const result = await runRetentionSweep(deps, NOW_SECONDS)

    expect(result.failed).toEqual([{ seedSlug: 'plain', id: 'a', reason: 'ledger down' }])
    expect(result.purged).toEqual([{ seedSlug: 'plain', id: 'b' }])
  })

  it('reports an expiry query that throws with id null and still sweeps the next seed', async () => {
    deps.seeds = [makeSeed('broken'), makeSeed('healthy')]
    findExpiredByRetention.mockRejectedValueOnce(new Error('no such table')).mockResolvedValueOnce(['x'])

    const result = await runRetentionSweep(deps, NOW_SECONDS)

    expect(result.failed).toEqual([{ seedSlug: 'broken', id: null, reason: 'no such table' }])
    expect(result.purged).toEqual([{ seedSlug: 'healthy', id: 'x' }])
  })

  it('treats an id restored between query and purge (EntryNotFoundError) as neither purged nor failed', async () => {
    deps.seeds = [makeSeed('plain')]
    findExpiredByRetention.mockResolvedValue(['gone'])
    purge.mockRejectedValueOnce(new EntryNotFoundError('gone'))

    const result = await runRetentionSweep(deps, NOW_SECONDS)

    expect(result).toEqual({ purged: [], failed: [] })
  })

  it('stops after RETENTION_SWEEP_MAX_PURGES attempts, passing the remaining budget as the next seed limit', async () => {
    const first = makeSeed('first')
    const second = makeSeed('second')
    const third = makeSeed('third')
    deps.seeds = [first, second, third]
    findExpiredByRetention
      .mockResolvedValueOnce(idsFor('f', 20))
      .mockResolvedValueOnce(idsFor('s', 5))

    const result = await runRetentionSweep(deps, NOW_SECONDS)

    expect(findExpiredByRetention.mock.calls.map(([seed, , , limit]) => [seed.slug, limit])).toEqual([
      ['first', RETENTION_SWEEP_MAX_PURGES],
      ['second', 5],
    ])
    expect(result.purged).toHaveLength(RETENTION_SWEEP_MAX_PURGES)
  })

  it("hands the purged row's media keys to the R2 cleanup", async () => {
    deps.seeds = [makeMediaSeed('gallery')]
    findExpiredByRetention.mockResolvedValue(['g1'])
    purge.mockResolvedValue({ row: { id: 'g1', photo: '/api/media/uploads/a.png' }, ledgerWritten: true })

    await runRetentionSweep(deps, NOW_SECONDS)

    expect(bucketDelete).toHaveBeenCalledWith('uploads/a.png')
  })

  it('keeps the id in purged when the R2 cleanup fails', async () => {
    deps.seeds = [makeMediaSeed('gallery')]
    findExpiredByRetention.mockResolvedValue(['g1'])
    purge.mockResolvedValue({ row: { id: 'g1', photo: '/api/media/uploads/a.png' }, ledgerWritten: true })
    bucketDelete.mockRejectedValue(new Error('r2 unavailable'))

    const result = await runRetentionSweep(deps, NOW_SECONDS)

    expect(result.purged).toEqual([{ seedSlug: 'gallery', id: 'g1' }])
    expect(result.failed).toEqual([])
  })

  it('rejects on a settings read failure and purges nothing', async () => {
    deps.seeds = [makeSeed('plain')]
    getAll.mockRejectedValue(new Error('d1 unavailable'))

    await expect(runRetentionSweep(deps, NOW_SECONDS)).rejects.toThrow('d1 unavailable')

    expect(findExpiredByRetention).not.toHaveBeenCalled()
    expect(purge).not.toHaveBeenCalled()
  })
})
