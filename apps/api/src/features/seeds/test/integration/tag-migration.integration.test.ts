// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// A database holding a pre-0.9 choice definition used to take the whole API down at registry
// hydration. It must now keep serving every other seed, name the broken one in a warning, and recover
// once `planTagMigration` + `tagMigrationStatements` (the engine behind `beech schema migrate`) run.
// Legacy state is produced the way old releases left it: by rewriting the stored definition and the
// stored values directly, because no route accepts the legacy shape any more.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import {
  introspectSeedDefinitions,
  planTagMigration,
  tagMigrationStatements,
  type Branch,
  type SchemaQueryExecutor,
} from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('tag contract migration — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let executor: SchemaQueryExecutor

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    executor = {
      async all<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
        const result = await harness.db.prepare(sql).all<T>()
        return result.results
      },
    }
  })

  afterEach(() => { vi.restoreAllMocks() })

  async function storeLegacyStatusOption(): Promise<void> {
    const row = await harness.db.prepare("SELECT definition FROM seeds WHERE slug = 'posts'").first<{ definition: string }>()
    if (!row) throw new Error('posts seed missing')
    const definition = JSON.parse(row.definition) as { branches: Array<Branch & { options?: unknown }> }
    definition.branches = definition.branches.map(branch =>
      branch.alias === 'internal_note' ? { ...branch, options: ['draft', 'live'] } : branch)
    await harness.db.prepare("UPDATE seeds SET definition = ? WHERE slug = 'posts'").bind(JSON.stringify(definition)).run()
    await harness.db.prepare("UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE id = 'registry_version'").run()
  }

  async function migrate(): Promise<void> {
    const seeds = await introspectSeedDefinitions(executor)
    const statements = tagMigrationStatements(planTagMigration(seeds), seeds)
    await harness.db.exec(statements.join('\n'))
  }

  it('keeps serving the other seeds when one seed holds a legacy choice definition', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await storeLegacyStatusOption()

    const response = await admin.get('/api/content/authors')

    expect(response.status).toBe(200)
  })

  it('disables the legacy seed and warns with the command that repairs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await storeLegacyStatusOption()

    const response = await admin.get('/api/content/posts')

    expect(response.status).toBe(404)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('beech schema migrate'))
  })

  it('wraps the stored strings into arrays and serves the migrated seed again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const created = await admin.post('/api/content/posts', { slug: 'legacy-entry', title: 'Legacy entry' })
    const { id } = await created.json<{ id: string }>()
    await harness.db.prepare('UPDATE content_posts SET internal_note = ? WHERE id = ?').bind('live', id).run()
    await storeLegacyStatusOption()

    await migrate()
    const response = await admin.get(`/api/content/posts/${id}`)

    expect(response.status).toBe(200)
    const body = await response.json<{ data: { internal_note: string[] } }>()
    expect(body.data.internal_note).toEqual(['live'])
    const row = await harness.db.prepare('SELECT internal_note FROM content_posts WHERE id = ?').bind(id).first<{ internal_note: string }>()
    expect(row?.internal_note).toBe('["live"]')
  })

  it('leaves nothing to migrate once the migration has run', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await storeLegacyStatusOption()

    await migrate()
    const remaining = planTagMigration(await introspectSeedDefinitions(executor))

    expect(remaining.steps).toEqual([])
  })
})
