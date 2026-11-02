// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IContentScanRepository, Seed } from '@beechcms/core'
import { FixedClock } from '@beechcms/testing'
import { CachedContentScanRepository, CONTENT_SCAN_TTL_MS } from './cached-content-scan.repository'

function makeSeed(alias: string): Seed {
  return {
    slug: 'posts',
    label: 'Post',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
      { id: 'br_02', alias, type: 'file', label: 'Image' },
    ],
  }
}

describe('CachedContentScanRepository', () => {
  let inner: IContentScanRepository
  let scan: ReturnType<typeof vi.fn>
  let clock: FixedClock
  let cached: CachedContentScanRepository

  beforeEach(() => {
    scan = vi.fn().mockImplementation(async () => new Set(['a.png']))
    inner = { getReferencedMediaKeys: scan }
    clock = new FixedClock(1_000_000)
    cached = new CachedContentScanRepository(inner, clock)
  })

  it('serves repeated reads inside the TTL from one scan', async () => {
    const seeds = [makeSeed('image')]

    const first = await cached.getReferencedMediaKeys(seeds)
    clock.advance(CONTENT_SCAN_TTL_MS - 1)
    const second = await cached.getReferencedMediaKeys(seeds)

    expect(second).toBe(first)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('scans again once the TTL has elapsed', async () => {
    const seeds = [makeSeed('image')]
    await cached.getReferencedMediaKeys(seeds)

    clock.advance(CONTENT_SCAN_TTL_MS)
    await cached.getReferencedMediaKeys(seeds)

    expect(scan).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight scan between concurrent callers', async () => {
    const seeds = [makeSeed('image')]

    await Promise.all([cached.getReferencedMediaKeys(seeds), cached.getReferencedMediaKeys(seeds), cached.getReferencedMediaKeys(seeds)])

    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('bypasses the cache for a fresh read and caches that result', async () => {
    const seeds = [makeSeed('image')]
    await cached.getReferencedMediaKeys(seeds)

    await cached.getReferencedMediaKeys(seeds, { fresh: true })
    await cached.getReferencedMediaKeys(seeds)

    expect(scan).toHaveBeenCalledTimes(2)
  })

  it('does not reuse a scan taken for a different seed schema', async () => {
    await cached.getReferencedMediaKeys([makeSeed('image')])

    await cached.getReferencedMediaKeys([makeSeed('cover')])

    expect(scan).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed scan', async () => {
    scan.mockRejectedValueOnce(new Error('D1 down'))
    const seeds = [makeSeed('image')]

    await expect(cached.getReferencedMediaKeys(seeds)).rejects.toThrow('D1 down')
    const retry = await cached.getReferencedMediaKeys(seeds)

    expect([...retry]).toEqual(['a.png'])
    expect(scan).toHaveBeenCalledTimes(2)
  })
})
