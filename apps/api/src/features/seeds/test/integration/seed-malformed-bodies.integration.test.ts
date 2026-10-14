// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — structurally malformed JSON bodies, integration tier. Valid JSON that is not the expected
 * object shape (`null`, a bare array, `null` branch entries) is a client error: 400, never a 500.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('seeds slice — malformed bodies (real D1)', () => {
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

  // Canonical seeds are manifest-owned and refuse REST edits before the body is read, so PUT and
  // branch-append are exercised against a runtime seed.
  beforeEach(async () => {
    await admin.post('/api/seeds', {
      slug: 'plain',
      label: 'Plain',
      branches: [{ alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
    })
  })

  async function seedCount(): Promise<number> {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seeds').first<{ n: number }>()
    return row?.n ?? 0
  }

  it.each([
    ['PUT /api/seeds/plain', () => admin.put('/api/seeds/plain', null)],
    ['POST /api/seeds/plain/branches', () => admin.post('/api/seeds/plain/branches', null)],
    ['POST /api/seeds/plain/mcp-plan', () => admin.post('/api/seeds/plain/mcp-plan', null)],
    ['POST /api/seeds/plain/mcp-apply', () => admin.post('/api/seeds/plain/mcp-apply', null)],
    ['POST /api/seeds', () => admin.post('/api/seeds', null)],
  ])('a null body on %s is refused with 400', async (_route, send) => {
    const before = await seedCount()

    const response = await send()

    expect(response.status).toBe(400)
    expect(await seedCount()).toBe(before)
  })

  it.each([
    ['POST /api/seeds', () => admin.post('/api/seeds', { slug: 'null_branch', displayNameAlias: 'title', branches: [null] })],
    ['PUT /api/seeds/plain', () => admin.put('/api/seeds/plain', { branches: [null] })],
    ['POST /api/seeds/plain/mcp-plan', () => admin.post('/api/seeds/plain/mcp-plan', { candidate: { displayNameAlias: 'title', branches: [null] } })],
    ['POST /api/seeds/plain/mcp-apply', () => admin.post('/api/seeds/plain/mcp-apply', { expectedVersion: 1, candidate: { displayNameAlias: 'title', branches: [null] } })],
  ])('a null entry in branches[] on %s is refused with 400', async (_route, send) => {
    const before = await seedCount()

    const response = await send()

    expect(response.status).toBe(400)
    expect(await seedCount()).toBe(before)
  })
})
