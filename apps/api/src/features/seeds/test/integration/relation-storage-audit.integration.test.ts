// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Audits relation storage that older releases left behind after `multiple` / `targetSeed` /
// `onDelete` edits. There is no HTTP route yet (the audit ships as `beech schema audit`), so the
// ACT is `auditRelationStorage` over the real D1 binding. Stranded state is produced the way the
// old releases did: by rewriting the stored definition without touching the physical tables.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, seedCanonicalEntries, type TestClient, type TestHarness } from '@beechcms/testing'
import {
  auditRelationStorage,
  introspectSeedDefinitions,
  type Branch,
  type SchemaQueryExecutor,
} from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('auditRelationStorage — integration (real D1)', () => {
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

  async function editStoredBranch(alias: string, update: Partial<Branch>): Promise<void> {
    const row = await harness.db.prepare("SELECT definition FROM seeds WHERE slug = 'posts'").first<{ definition: string }>()
    if (!row) throw new Error('posts seed missing')
    const definition = JSON.parse(row.definition) as { branches: Branch[] }
    definition.branches = definition.branches.map(branch => branch.alias === alias ? { ...branch, ...update } : branch)
    await harness.db.prepare("UPDATE seeds SET definition = ? WHERE slug = 'posts'").bind(JSON.stringify(definition)).run()
  }

  async function audit() {
    return auditRelationStorage(executor, await introspectSeedDefinitions(executor))
  }

  it('reports nothing when every canonical relation matches its physical storage', async () => {
    const findings = await audit()

    expect(findings).toEqual([])
  })

  it('flags a single relation redefined as multiple and counts the values stranded in the FK column', async () => {
    const author = await admin.post('/api/content/authors', { slug: 'ada', name: 'Ada' })
    const { id: authorId } = await author.json<{ id: string }>()
    await admin.post('/api/content/posts', { slug: 'with-author', title: 'With author', author_id: authorId })
    await editStoredBranch('author_id', { multiple: true })

    const findings = await audit()

    expect(findings).toEqual([
      expect.objectContaining({ seed: 'posts', alias: 'author_id', issue: 'wrong_storage', strandedRows: 1 }),
    ])
    const stored = await harness.db.prepare('SELECT author_id FROM content_posts WHERE slug = ?').bind('with-author').first<{ author_id: string }>()
    expect(stored?.author_id).toBe(authorId)
  })

  it('flags a multiple relation redefined as single and counts the junction rows left behind', async () => {
    const [seeded] = await seedCanonicalEntries(harness)
    const linked = await admin.post('/api/content/posts', { slug: 'linked', title: 'Linked', related_posts: [seeded!.id] })
    expect(linked.status).toBe(201)
    await editStoredBranch('related_posts', { multiple: false })

    const findings = await audit()

    expect(findings).toEqual([
      expect.objectContaining({ seed: 'posts', alias: 'related_posts', issue: 'wrong_storage', strandedRows: 1 }),
    ])
    const junction = await harness.db.prepare('SELECT COUNT(*) AS n FROM rel_posts_related_posts').first<{ n: number }>()
    expect(junction?.n).toBe(1)
  })

  it('flags a relation whose targetSeed changed while the FK still points at the old table', async () => {
    await editStoredBranch('author_id', { targetSeed: 'categories' })

    const findings = await audit()

    expect(findings).toEqual([
      expect.objectContaining({ seed: 'posts', alias: 'author_id', issue: 'fk_target_mismatch', strandedRows: 0 }),
    ])
  })

  it('flags a relation whose onDelete changed while the FK keeps the old rule', async () => {
    await editStoredBranch('author_id', { onDelete: 'RESTRICT' })

    const findings = await audit()

    expect(findings).toEqual([
      expect.objectContaining({ seed: 'posts', alias: 'author_id', issue: 'fk_on_delete_mismatch', strandedRows: 0 }),
    ])
  })
})
