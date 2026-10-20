// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — orphan column cleanup (real D1). A branch omitted from a PUT leaves its column
 * behind; the orphans listing must expose only those columns and the drop-by-name endpoint must
 * remove exactly one of them without touching the seed definition or system columns.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface SeedRecordBody {
  definition: { branches: Array<{ id: string; alias: string; type: string }> } & Record<string, unknown>
}

describe('seeds slice — orphan columns (real D1)', () => {
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

  const titleBranch = { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }
  const bodyBranch = { alias: 'body', label: 'Body', type: 'text', policies: { filter: false, search: false } }

  async function createSeed(slug: string, extra: Record<string, unknown> = {}) {
    const response = await admin.post('/api/seeds', { slug, label: slug, branches: [titleBranch, bodyBranch], ...extra })
    expect(response.status).toBe(201)
  }

  /** Re-PUT the seed without `body`: allowed, leaves the column behind as an orphan. */
  async function omitBody(slug: string) {
    const record = await (await admin.get(`/api/seeds/${slug}`)).json<SeedRecordBody>()
    const title = record.definition.branches.find(b => b.alias === 'title')
    const response = await admin.put(`/api/seeds/${slug}`, { ...record.definition, branches: [title] })
    expect(response.status, await response.clone().text()).toBe(200)
  }

  async function orphans(slug: string) {
    return (await (await admin.get(`/api/seeds/${slug}/orphans`)).json<{ orphans: string[] }>()).orphans
  }

  async function columns(table: string) {
    const rows = await harness.db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
    return rows.results.map(row => row.name)
  }

  function dropOrphan(slug: string, column: string, confirm: string) {
    return admin.delete(`/api/seeds/${slug}/orphans/${column}`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm }),
    })
  }

  it('drops an orphan column by name and keeps the seed definition intact', async () => {
    await createSeed('orph_drop')
    await omitBody('orph_drop')
    expect(await orphans('orph_drop')).toEqual(['body'])
    const definitionBefore = await (await admin.get('/api/seeds/orph_drop')).json<SeedRecordBody>()

    const response = await dropOrphan('orph_drop', 'body', 'orph_drop.body')

    expect(response.status).toBe(200)
    expect(await columns('content_orph_drop')).not.toContain('body')
    expect(await orphans('orph_drop')).toEqual([])
    const definitionAfter = await (await admin.get('/api/seeds/orph_drop')).json<SeedRecordBody>()
    expect(definitionAfter.definition.branches).toEqual(definitionBefore.definition.branches)
  })

  it('drops the draft-table column too when the seed allows drafts', async () => {
    await createSeed('orph_draft', { allowDrafts: true })
    await omitBody('orph_draft')
    expect(await columns('content_orph_draft_drafts')).toContain('body')

    const response = await dropOrphan('orph_draft', 'body', 'orph_draft.body')

    expect(response.status).toBe(200)
    expect(await columns('content_orph_draft')).not.toContain('body')
    expect(await columns('content_orph_draft_drafts')).not.toContain('body')
  })

  it('does not list deleted_at of a soft-delete seed as an orphan', async () => {
    await createSeed('orph_soft', { softDelete: true })
    expect(await columns('content_orph_soft')).toContain('deleted_at')

    expect(await orphans('orph_soft')).toEqual([])
  })

  it('refuses to drop system columns, defined branches, invalid and unknown columns without altering the table', async () => {
    await createSeed('orph_guard', { softDelete: true })
    const before = await columns('content_orph_guard')

    for (const column of ['deleted_at', 'status', 'title', 'ghost', 'Bad-Name']) {
      const response = await dropOrphan('orph_guard', column, `orph_guard.${column}`)
      expect(response.status, column).toBe(404)
    }

    expect(await columns('content_orph_guard')).toEqual(before)
  })

  it('requires the typed confirmation before dropping', async () => {
    await createSeed('orph_confirm')
    await omitBody('orph_confirm')

    const response = await dropOrphan('orph_confirm', 'body', 'wrong')

    expect(response.status).toBe(400)
    expect(await columns('content_orph_confirm')).toContain('body')
  })
})
