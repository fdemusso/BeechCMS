// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — manage_seeds access integration tier.
 * Proves `/api/seeds/*` is gated by `manage_seeds` at the global scope alone.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestHarness } from '@beechcms/testing'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SEEDS_ROLE_ID = 'b15c6d7e-8f90-4a12-83b4-c5de6f708192'
const newSeed = (slug: string) => ({
  slug,
  label: 'Posts',
  branches: [{ alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
})

describe('seeds slice — manage_seeds access (real D1)', () => {
  let harness: TestHarness

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Custom roles (and their assignments, via FK cascade) outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM roles WHERE is_system = 0').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [CANONICAL_USERS.admin, CANONICAL_USERS.editor],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
  })

  const grantEditor = async (scope: string): Promise<void> => {
    await harness.db.batch([
      harness.db.prepare('INSERT INTO roles (id, name) VALUES (?, ?)').bind(SEEDS_ROLE_ID, 'Seeds manager'),
      harness.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(SEEDS_ROLE_ID, 'manage_seeds'),
      harness.db
        .prepare('INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)')
        .bind('seeds-assignment', CANONICAL_USERS.editor.id, SEEDS_ROLE_ID, scope),
    ])
  }

  const countSeeds = async (slug: string): Promise<number> => {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seeds WHERE slug = ?').bind(slug).first<{ n: number }>()
    return row?.n ?? 0
  }

  it("the canonical editor holding manage_seeds at '*' lists seeds with 200", async () => {
    await grantEditor(GLOBAL_SCOPE)
    const editor = await harness.asUser('editor')

    const response = await editor.get('/api/seeds')

    expect(response.status).toBe(200)
    expect(Array.isArray(await response.json<unknown[]>())).toBe(true)
  })

  it("the canonical editor holding manage_seeds at '*' creates a seed with 201 and the seeds row exists", async () => {
    await grantEditor(GLOBAL_SCOPE)
    const editor = await harness.asUser('editor')

    const response = await editor.post('/api/seeds', newSeed('access_created'))

    expect(response.status).toBe(201)
    expect(await countSeeds('access_created')).toBe(1)
  })

  it("manage_seeds held only on seed 'posts' is refused 403 forbidden on GET /api/seeds", async () => {
    await grantEditor('posts')
    const editor = await harness.asUser('editor')

    const response = await editor.get('/api/seeds')

    expect(response.status).toBe(403)
    expect(await response.json<{ error: string }>()).toMatchObject({ error: 'forbidden' })
  })

  it('the canonical editor without manage_seeds is refused 403 forbidden on POST /api/seeds and no seed row is written', async () => {
    const editor = await harness.asUser('editor')

    const response = await editor.post('/api/seeds', newSeed('access_refused'))

    expect(response.status).toBe(403)
    expect(await response.json<{ error: string }>()).toMatchObject({ error: 'forbidden' })
    expect(await countSeeds('access_refused')).toBe(0)
  })

  it('a caller without manage_seeds sending a non-JSON body to PUT /api/seeds/:slug receives 403, not 400', async () => {
    const editor = await harness.asUser('editor')

    const response = await editor.request('/api/seeds/access_malformed', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })

    expect(response.status).toBe(403)
    expect(await countSeeds('access_malformed')).toBe(0)
  })

  it('the canonical admin (SuperAdmin) lists seeds with 200', async () => {
    const admin = await harness.asUser('admin')

    const response = await admin.get('/api/seeds')

    expect(response.status).toBe(200)
  })
})
