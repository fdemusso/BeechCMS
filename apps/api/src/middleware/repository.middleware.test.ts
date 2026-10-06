// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { BeechBucket, DeletionLedgerEvent } from '@beechcms/core'
import { createBeechApp } from '../factory'
import { InMemorySeedRepository } from '../shared/db/repositories/in-memory-seed.repository'

const EVENT: DeletionLedgerEvent = {
  seedSlug: 'orders',
  entryId: 'e1',
  entrySlug: 'first-order',
  purgedAt: 1_700_000_000,
  actorId: 'u1',
  reason: 'purge',
}

function buildApp(bucket: BeechBucket) {
  const app = createBeechApp({ seeds: [], seedRepository: new InMemorySeedRepository([]), bucket })
  app.get('/__probe', async (context) => {
    await context.get('deletionLedger').append(EVENT)
    return context.json({ ok: true })
  })
  return app
}

describe('repositoryMiddleware', () => {
  it('writes deletion ledger events to the bucket configured on the app, not an environment-derived one', async () => {
    const bucket = { put: vi.fn().mockResolvedValue(undefined) } as unknown as BeechBucket
    const app = buildApp(bucket)

    const response = await app.request('/__probe', undefined, { DB: {}, JWT_SECRET: 'x'.repeat(32) })

    expect(response.status).toBe(200)
    expect(bucket.put).toHaveBeenCalledWith(
      '_deletion-ledger/orders/e1.json',
      expect.any(Uint8Array),
      { contentType: 'application/json' },
    )
  })
})
