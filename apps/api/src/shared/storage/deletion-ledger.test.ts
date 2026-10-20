// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { BeechBucket, DeletionLedgerEvent } from '@beechcms/core'
import { R2DeletionLedger } from './deletion-ledger'

function makeEvent(overrides: Partial<DeletionLedgerEvent> = {}): DeletionLedgerEvent {
  return {
    seedSlug: 'orders',
    entryId: 'e1',
    entrySlug: 'first-order',
    purgedAt: 1_700_000_000,
    actorId: 'u1',
    reason: 'purge',
    ...overrides,
  }
}

describe('R2DeletionLedger', () => {
  it('append writes one object under _deletion-ledger/{seed}/{id}.json', async () => {
    const bucket: Pick<BeechBucket, 'put'> = { put: vi.fn().mockResolvedValue(undefined) }
    const ledger = new R2DeletionLedger(bucket as BeechBucket)

    await ledger.append(makeEvent())

    expect(bucket.put).toHaveBeenCalledWith(
      '_deletion-ledger/orders/e1.json',
      expect.any(Uint8Array),
      { contentType: 'application/json' },
    )
  })

  it('append rejects when the underlying put rejects', async () => {
    const bucket: Pick<BeechBucket, 'put'> = { put: vi.fn().mockRejectedValue(new Error('R2 unavailable')) }
    const ledger = new R2DeletionLedger(bucket as BeechBucket)

    await expect(ledger.append(makeEvent())).rejects.toThrow('R2 unavailable')
  })

  it('list returns the events found under the seed prefix', async () => {
    const event = makeEvent()
    const bucket: Pick<BeechBucket, 'list' | 'get'> = {
      list: vi.fn().mockResolvedValue({ objects: [{ key: '_deletion-ledger/orders/e1.json', size: 10 }] }),
      get: vi.fn().mockResolvedValue({ body: new TextEncoder().encode(JSON.stringify(event)).buffer, size: 10 }),
    }
    const ledger = new R2DeletionLedger(bucket as BeechBucket)

    const { events } = await ledger.list('orders')

    expect(bucket.list).toHaveBeenCalledWith({ prefix: '_deletion-ledger/orders/', limit: 100, cursor: undefined })
    expect(events).toEqual([event])
  })
})
