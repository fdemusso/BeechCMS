// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BeechBucket, DeletionLedgerEvent, ISeedRepository } from '@beechcms/core'
import { createBeechApp } from '../factory'
import { InMemorySeedRepository } from '../shared/db/repositories/in-memory-seed.repository'
import { __resetSeedRegistryCache } from '../shared/services/cache/seed-registry-cache'

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

// Answers only the two reads seedRegistryMiddleware issues: registry version and active seeds.
function fakeSeedDatabase(): D1Database {
  const statement = { first: async () => ({ value: '1' }), all: async () => ({ results: [] }) }
  return { prepare: () => statement } as unknown as D1Database
}

describe('repositoryMiddleware', () => {
  beforeEach(() => __resetSeedRegistryCache())


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

  it('hands the same D1 seed repository to every request on one binding, a different one per binding', async () => {
    const seenRepositories: ISeedRepository[] = []
    const app = createBeechApp({ seeds: [], bucket: { put: vi.fn() } as unknown as BeechBucket })
    app.get('/__seed-repository', (context) => {
      seenRepositories.push(context.get('seedRepository'))
      return context.json({ ok: true })
    })
    const env = { DB: fakeSeedDatabase(), JWT_SECRET: 'x'.repeat(32) }
    const otherEnv = { DB: fakeSeedDatabase(), JWT_SECRET: 'x'.repeat(32) }

    await app.request('/__seed-repository', undefined, env)
    await app.request('/__seed-repository', undefined, env)
    await app.request('/__seed-repository', undefined, otherEnv)

    // The seed registry cache keys on this instance, so a fresh one per request would defeat it.
    expect(seenRepositories[1]).toBe(seenRepositories[0])
    expect(seenRepositories[2]).not.toBe(seenRepositories[0])
  })
})
