// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — referenced-by guard on seed deletion, integration tier. Only OTHER seeds count as
 * referencers: a relation pointing back at its own seed dies with the seed and must not block deletion.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('seeds slice — delete guards (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  async function seedStatus(slug: string): Promise<string | undefined> {
    const row = await harness.db.prepare('SELECT status FROM seeds WHERE slug = ?').bind(slug).first<{ status: string }>()
    return row?.status
  }

  // Canonical seeds are manifest-owned and refuse deletion, so the self-referential seed is created at runtime.
  async function createSelfReferencingSeed(): Promise<void> {
    await admin.post('/api/seeds', {
      slug: 'nodes',
      label: 'Nodes',
      branches: [
        { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
        { alias: 'related', label: 'Related', type: 'relation', targetSeed: 'nodes', multiple: true, onDelete: 'CASCADE' },
      ],
    })
  }

  it('soft-deleting a seed whose only referencer is itself succeeds', async () => {
    await createSelfReferencingSeed()

    const response = await admin.delete('/api/seeds/nodes')

    expect(response.status).toBe(200)
    expect(await seedStatus('nodes')).toBe('deleted')
  })

  it('hard-deleting a seed whose only referencer is itself is accepted for purge', async () => {
    await createSelfReferencingSeed()

    const response = await admin.request('/api/seeds/nodes/hard', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'nodes' }),
    })

    expect(response.status).toBe(202)
  })

  it('a seed referenced by another seed is still refused with 409 naming that seed', async () => {
    await admin.post('/api/seeds', {
      slug: 'shelves',
      label: 'Shelves',
      branches: [{ alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
    })
    await admin.post('/api/seeds', {
      slug: 'books',
      label: 'Books',
      branches: [
        { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
        { alias: 'shelf', label: 'Shelf', type: 'relation', targetSeed: 'shelves' },
      ],
    })

    const response = await admin.delete('/api/seeds/shelves')

    expect(response.status).toBe(409)
    const body = await response.json<{ detail: string }>()
    expect(body.detail).toContain('books')
    expect(await seedStatus('shelves')).toBe('active')
  })
})
