// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — integration tier. Covers the soft-delete/trash/purge HTTP surface against
 * real D1 through the full middleware chain: soft delete, restore (including the auto-rename
 * conflict path), trashed-only purge, bulk variants, the trash list, trash permissions, lifecycle
 * hooks, and reconciliation against the deletion ledger. No seed here declares `softDelete`:
 * every case doubles as the regression guard that the deprecated flag is never read. Media/R2 cleanup itself stays out of scope — the ledger write
 * uses a real (Miniflare-simulated) R2 binding (see vitest.workers.config.ts), never a fake.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, toTrashedSlug, type BeechHooks } from '@beechcms/core'
import { CANONICAL_USERS, createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const trashSeed = defineSeed({
  slug: 'trash_orders',
  label: 'Trash Order',
  labelPlural: 'Trash Orders',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'secret', label: 'Secret', type: 'text', policies: { visibility: 'masked' } },
  ],
})

const plainSeed = defineSeed({
  slug: 'plain_orders',
  label: 'Plain Order',
  labelPlural: 'Plain Orders',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
  ],
})

const bulkTargetSeed = defineSeed({
  slug: 'bulk_rel_targets',
  label: 'Bulk Rel Target',
  labelPlural: 'Bulk Rel Targets',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
  ],
})

const bulkSourceSeed = defineSeed({
  slug: 'bulk_rel_sources',
  label: 'Bulk Rel Source',
  labelPlural: 'Bulk Rel Sources',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'bulk_rel_targets', multiple: true },
  ],
})

describe('content slice — soft delete integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let hooks: BeechHooks

  beforeEach(async () => {
    __resetSeedRegistryCache()
    hooks = { beforeDelete: vi.fn(), afterDelete: vi.fn() }
    harness = await createTestHarness({
      db: env.DB,
      seeds: [trashSeed, plainSeed, bulkTargetSeed, bulkSourceSeed],
      // Purge writes to the deletion ledger, which needs a working BeechBucket; the r2Buckets
      // binding in vitest.workers.config.ts provisions a real (simulated) one for this tier.
      env: { MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders, hooks }),
    })
    admin = await harness.asUser('admin')
  })

  async function createTrashOrder(title: string, slug: string): Promise<string> {
    const created = await admin.post('/api/content/trash_orders', { title, slug })
    expect(created.status).toBe(201)
    return (await created.json<{ id: string }>()).id
  }

  // The canonical viewer has no role of its own; each test hands it exactly the scopes it needs.
  async function grantViewerRead(scopes: string[]): Promise<TestClient> {
    await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.viewer.id).run()
    await harness.db.prepare("INSERT OR IGNORE INTO roles (id, name) VALUES ('trash-reader', 'Trash Reader')").run()
    await harness.db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES ('trash-reader', 'content:read')").run()
    for (const scope of scopes) {
      await harness.db
        .prepare('INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)')
        .bind(`trash-reader-${scope}`, CANONICAL_USERS.viewer.id, 'trash-reader', scope)
        .run()
    }
    return harness.asUser('viewer')
  }

  function ledgerObject(id: string) {
    const bucket = (env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET
    return bucket.head(`_deletion-ledger/trash_orders/${id}.json`)
  }

  it('DELETE on a seed with no flag keeps the row with deleted_at from the clock and a _old_ slug, absent from the list', async () => {
    const id = await createTrashOrder('Order 1', 'order-1')

    const response = await admin.delete(`/api/content/trash_orders/${id}`)

    expect(response.status).toBe(200)
    const body = await response.json<{ success: boolean; softDeleted: boolean }>()
    expect(body.softDeleted).toBe(true)

    const row = await harness.db.prepare('SELECT slug, deleted_at FROM content_trash_orders WHERE id = ?').bind(id).first<{ slug: string; deleted_at: number | null }>()
    expect(row?.deleted_at).toBe(harness.clock.nowSeconds())
    expect(row?.slug).toBe(toTrashedSlug('order-1', harness.clock.now()))

    const listResponse = await admin.get('/api/content/trash_orders')
    const items = await listResponse.json<Array<{ id: string }>>()
    expect(items.map(i => i.id)).not.toContain(id)
  })

  it('a slug is reusable right after its entry is soft-deleted', async () => {
    const created = await admin.post('/api/content/plain_orders', { title: 'Plain 1', slug: 'plain-1' })
    const { id } = await created.json<{ id: string }>()
    await admin.delete(`/api/content/plain_orders/${id}`)

    const response = await admin.post('/api/content/plain_orders', { title: 'Plain 2', slug: 'plain-1' })

    expect(response.status).toBe(201)
    const live = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_plain_orders WHERE slug = ? AND deleted_at IS NULL').bind('plain-1').first<{ n: number }>()
    expect(live?.n).toBe(1)
  })

  it('POST /:slug/:id/restore puts back the original slug, clears deleted_at and the entry reappears in the list', async () => {
    const id = await createTrashOrder('Order 2', 'order-2')
    await admin.delete(`/api/content/trash_orders/${id}`)

    const response = await admin.post(`/api/content/trash_orders/${id}/restore`)

    expect(response.status).toBe(200)
    const body = await response.json<{ success: boolean; slug: string }>()
    expect(body.slug).toBe('order-2')

    const row = await harness.db.prepare('SELECT slug, deleted_at FROM content_trash_orders WHERE id = ?').bind(id).first<{ slug: string; deleted_at: number | null }>()
    expect(row?.slug).toBe('order-2')
    expect(row?.deleted_at).toBeNull()

    const listResponse = await admin.get('/api/content/trash_orders')
    const items = await listResponse.json<Array<{ id: string }>>()
    expect(items.map(i => i.id)).toContain(id)
  })

  it('restoring an entry whose slug was reassigned lands on <original>-restored-<id8>, never on the _old_ form', async () => {
    const firstId = await createTrashOrder('Reused', 'reused-slug')
    await admin.delete(`/api/content/trash_orders/${firstId}`)
    const secondId = await createTrashOrder('Reused Again', 'reused-slug')

    const response = await admin.post(`/api/content/trash_orders/${firstId}/restore`)

    expect(response.status).toBe(200)
    const expectedSlug = `reused-slug-restored-${firstId.slice(0, 8)}`
    const body = await response.json<{ success: boolean; slug: string }>()
    expect(body.slug).toBe(expectedSlug)

    const rows = await harness.db.prepare('SELECT id, slug, deleted_at FROM content_trash_orders WHERE id IN (?, ?)').bind(firstId, secondId).all<{ id: string; slug: string; deleted_at: number | null }>()
    expect(rows.results).toHaveLength(2)
    expect(rows.results?.find(row => row.id === firstId)?.slug).toBe(expectedSlug)
    expect(rows.results?.find(row => row.id === secondId)?.slug).toBe('reused-slug')
    for (const row of rows.results ?? []) {
      expect(row.deleted_at).toBeNull()
    }
  })

  it('restoring a row trashed before the feature keeps its slug', async () => {
    const id = await createTrashOrder('Legacy', 'legacy-trashed')
    await harness.db.prepare('UPDATE content_trash_orders SET deleted_at = ? WHERE id = ?').bind(harness.clock.nowSeconds(), id).run()

    const response = await admin.post(`/api/content/trash_orders/${id}/restore`)

    expect(response.status).toBe(200)
    const body = await response.json<{ success: boolean; slug: string }>()
    expect(body.slug).toBe('legacy-trashed')

    const row = await harness.db.prepare('SELECT slug, deleted_at FROM content_trash_orders WHERE id = ?').bind(id).first<{ slug: string; deleted_at: number | null }>()
    expect(row?.slug).toBe('legacy-trashed')
    expect(row?.deleted_at).toBeNull()
  })

  it('DELETE ...?purge=true on a live entry answers 404 content-not-found and leaves the row and the ledger untouched', async () => {
    const id = await createTrashOrder('Still Live', 'still-live')

    const response = await admin.delete(`/api/content/trash_orders/${id}?purge=true`)

    expect(response.status).toBe(404)
    const body = await response.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/content-not-found')

    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_trash_orders WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ n: number }>()
    expect(row?.n).toBe(1)
    expect(await ledgerObject(id)).toBeNull()
  })

  it('DELETE ...?purge=true on a trashed entry removes the row, its junction rows, and its _drafts row', async () => {
    const id = await createTrashOrder('Purge Me', 'purge-me')
    await admin.put(`/api/content/trash_orders/${id}/draft`, { title: 'Draft edit' })
    await admin.delete(`/api/content/trash_orders/${id}`)

    const response = await admin.delete(`/api/content/trash_orders/${id}?purge=true`)

    expect(response.status).toBe(200)
    const body = await response.json<{ success: boolean; softDeleted: boolean }>()
    expect(body.softDeleted).toBe(false)

    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_trash_orders WHERE id = ?').bind(id).first<{ n: number }>()
    expect(row?.n).toBe(0)
    const draftRow = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_trash_orders_drafts WHERE entry_id = ?').bind(id).first<{ n: number }>()
    expect(draftRow?.n).toBe(0)
  })

  it('beforeDelete/afterDelete fire on soft delete, purge, and bulk purge', async () => {
    const softTarget = await admin.post('/api/content/trash_orders', { title: 'Hook Soft', slug: 'hook-soft' })
    const { id: softId } = await softTarget.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${softId}`)
    expect(hooks.beforeDelete).toHaveBeenCalledWith(softId, expect.anything())
    expect(hooks.afterDelete).toHaveBeenCalledWith(softId, expect.anything())

    const purgeId = await createTrashOrder('Hook Purge', 'hook-purge')
    await admin.delete(`/api/content/trash_orders/${purgeId}`)
    vi.mocked(hooks.beforeDelete!).mockClear()
    vi.mocked(hooks.afterDelete!).mockClear()
    await admin.delete(`/api/content/trash_orders/${purgeId}?purge=true`)
    expect(hooks.beforeDelete).toHaveBeenCalledWith(purgeId, expect.anything())
    expect(hooks.afterDelete).toHaveBeenCalledWith(purgeId, expect.anything())

    const bulkId = await createTrashOrder('Hook Bulk', 'hook-bulk')
    await admin.delete(`/api/content/trash_orders/${bulkId}`)
    vi.mocked(hooks.beforeDelete!).mockClear()
    vi.mocked(hooks.afterDelete!).mockClear()
    await admin.post('/api/content/trash_orders/trash/bulk-purge', { ids: [bulkId] })
    expect(hooks.beforeDelete).toHaveBeenCalledWith(bulkId, expect.anything())
    expect(hooks.afterDelete).toHaveBeenCalledWith(bulkId, expect.anything())
  })

  it('bulk-restore reports per-id outcomes and leaves untouched ids untouched', async () => {
    const idA = await createTrashOrder('A', 'bulk-a')
    await admin.delete(`/api/content/trash_orders/${idA}`)
    const idB = await createTrashOrder('B', 'bulk-b')

    const response = await admin.post('/api/content/trash_orders/trash/bulk-restore', { ids: [idA, 'not-an-id'] })

    expect(response.status).toBe(200)
    const body = await response.json<{ succeeded: string[]; failed: Array<{ id: string }> }>()
    expect(body.succeeded).toEqual([idA])
    expect(body.failed.map(f => f.id)).toEqual(['not-an-id'])

    const rows = await harness.db.prepare('SELECT id, deleted_at FROM content_trash_orders WHERE id IN (?, ?)').bind(idA, idB).all<{ id: string; deleted_at: number | null }>()
    expect(rows.results).toHaveLength(2)
    for (const row of rows.results ?? []) {
      expect(row.deleted_at).toBeNull()
    }
  })

  it('bulk-purge erases the trashed id and reports the live id as 404 without touching it', async () => {
    const trashedId = await createTrashOrder('Trashed', 'bulk-trashed')
    await admin.delete(`/api/content/trash_orders/${trashedId}`)
    const liveId = await createTrashOrder('Live', 'bulk-live')

    const response = await admin.post('/api/content/trash_orders/trash/bulk-purge', { ids: [trashedId, liveId] })

    expect(response.status).toBe(200)
    const body = await response.json<{ succeeded: string[]; failed: Array<{ id: string; problem: { status: number; type: string } }> }>()
    expect(body.succeeded).toEqual([trashedId])
    expect(body.failed).toHaveLength(1)
    expect(body.failed[0]).toMatchObject({ id: liveId, problem: { status: 404, type: 'content-not-found' } })

    const trashedRow = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_trash_orders WHERE id = ?').bind(trashedId).first<{ n: number }>()
    expect(trashedRow?.n).toBe(0)
    const liveRow = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_trash_orders WHERE id = ? AND deleted_at IS NULL').bind(liveId).first<{ n: number }>()
    expect(liveRow?.n).toBe(1)
  })

  it('GET /:slug/trash returns only trashed rows, newest-first', async () => {
    const kept = await admin.post('/api/content/trash_orders', { title: 'Kept', slug: 'trash-kept' })
    const { id: keptId } = await kept.json<{ id: string }>()

    const older = await admin.post('/api/content/trash_orders', { title: 'Older Trashed', slug: 'trash-older' })
    const { id: olderId } = await older.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${olderId}`)

    harness.clock.advance(1000)

    const newer = await admin.post('/api/content/trash_orders', { title: 'Newer Trashed', slug: 'trash-newer' })
    const { id: newerId } = await newer.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${newerId}`)

    const response = await admin.get('/api/content/trash_orders/trash')

    expect(response.status).toBe(200)
    const body = await response.json<{ items: Array<{ id: string }>; total: number }>()
    const ids = body.items.map(i => i.id)
    expect(ids).not.toContain(keptId)
    expect(ids).toEqual([newerId, olderId])
  })

  it('GET /:slug/trash returns each item with its deleted_at timestamp and a data envelope', async () => {
    const created = await admin.post('/api/content/trash_orders', { title: 'Enveloped', slug: 'enveloped' })
    const { id } = await created.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${id}`)

    const response = await admin.get('/api/content/trash_orders/trash')

    expect(response.status).toBe(200)
    const body = await response.json<{ items: Array<{ deleted_at: number; data: { title: string } }> }>()
    const item = body.items.find((i) => i.data.title === 'Enveloped')
    expect(typeof item?.deleted_at).toBe('number')
    expect(item?.data.title).toBe('Enveloped')
  })

  // The trash route reuses applyVisibility so a branch hidden on the main list cannot be
  // read through the Trash — regression guard for the field-level leak found in pre-computation.
  it('a masked branch stays masked on the trash route', async () => {
    const created = await admin.post('/api/content/trash_orders', {
      title: 'Masked Owner',
      slug: 'masked-owner',
      secret: 'do-not-leak',
    })
    const { id } = await created.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${id}`)

    const response = await admin.get('/api/content/trash_orders/trash')

    const body = await response.json<{ items: Array<{ data: { title: string; secret: string } }> }>()
    const item = body.items.find((i) => i.data.title === 'Masked Owner')
    expect(item?.data.secret).toBe('••••••••')
  })

  it('POST /:slug/trash/reconcile re-purges a row that exists in D1 but is recorded in the ledger', async () => {
    const id = await createTrashOrder('Resurrected', 'resurrected')
    await admin.delete(`/api/content/trash_orders/${id}`)
    await admin.delete(`/api/content/trash_orders/${id}?purge=true`)

    // Simulates a D1 Time Travel restore: the row is back, but the R2 ledger (untouched by
    // any D1 restore) still records the erasure. The resurrected row is LIVE, which proves the
    // reconcile-only trashed: 'any' opt-in. entry_id must match UUID_V4_PATTERN, same as
    // production ids — this is a resurrection, not a hand-invented fixture shape.
    expect(id).toMatch(UUID_V4_PATTERN)
    await harness.db
      .prepare('INSERT INTO content_trash_orders (id, slug, status, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, 'resurrected', 'draft', 'Resurrected', harness.clock.nowSeconds(), harness.clock.nowSeconds())
      .run()

    const response = await admin.post('/api/content/trash_orders/trash/reconcile')

    expect(response.status).toBe(200)
    const body = await response.json<{ scanned: number; repurged: string[] }>()
    expect(body.repurged).toContain(id)

    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_trash_orders WHERE id = ?').bind(id).first<{ n: number }>()
    expect(row?.n).toBe(0)
  })

  it('a read-only user lists the Trash of a seed with no flag', async () => {
    const id = await createTrashOrder('Visible', 'visible-trashed')
    await admin.delete(`/api/content/trash_orders/${id}`)
    const viewer = await grantViewerRead(['trash_orders'])

    const response = await viewer.get('/api/content/trash_orders/trash')

    expect(response.status).toBe(200)
    const body = await response.json<{ items: Array<{ id: string }> }>()
    expect(body.items.map(item => item.id)).toEqual([id])
  })

  it('a read-only user is refused 403 on restore, bulk-restore and bulk-purge, and the entry stays trashed', async () => {
    const id = await createTrashOrder('Guarded', 'guarded-trashed')
    await admin.delete(`/api/content/trash_orders/${id}`)
    const viewer = await grantViewerRead(['trash_orders'])
    const attempts = [
      () => viewer.post(`/api/content/trash_orders/${id}/restore`),
      () => viewer.post('/api/content/trash_orders/trash/bulk-restore', { ids: [id] }),
      () => viewer.post('/api/content/trash_orders/trash/bulk-purge', { ids: [id] }),
    ]

    const statuses: number[] = []
    for (const attempt of attempts) statuses.push((await attempt()).status)

    expect(statuses).toEqual([403, 403, 403])
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_trash_orders WHERE id = ? AND deleted_at IS NOT NULL').bind(id).first<{ n: number }>()
    expect(row?.n).toBe(1)
  })

  it('a user with no grant on the seed is refused 403 on GET /trash', async () => {
    const viewer = await grantViewerRead([])

    const response = await viewer.get('/api/content/trash_orders/trash')

    expect(response.status).toBe(403)
  })

  it('GET /api/search excludes soft-deleted entries (#465)', async () => {
    const created = await admin.post('/api/content/trash_orders', { title: 'Searchable Trash Item', slug: 'searchable-trash-item' })
    expect(created.status).toBe(201)
    const { id } = await created.json<{ id: string }>()

    // Before deletion: should be found by search
    const beforeSearch = await admin.get('/api/search?q=Searchable')
    expect(beforeSearch.status).toBe(200)
    const beforeBody = await beforeSearch.json<{ items: Array<{ id: string }>; total: number }>()
    expect(beforeBody.total).toBe(1)
    expect(beforeBody.items.map(i => i.id)).toContain(id)

    // Move entry to trash (soft delete)
    const deleted = await admin.delete(`/api/content/trash_orders/${id}`)
    expect(deleted.status).toBe(200)

    // After soft-delete: trashed entry must not appear in search results or total
    const afterSearch = await admin.get('/api/search?q=Searchable')
    expect(afterSearch.status).toBe(200)
    const afterBody = await afterSearch.json<{ items: Array<{ id: string }>; total: number }>()
    expect(afterBody.total).toBe(0)
    expect(afterBody.items.map(i => i.id)).not.toContain(id)

    // Restore entry: should appear in search results again
    const restored = await admin.post(`/api/content/trash_orders/${id}/restore`)
    expect(restored.status).toBe(200)

    const restoredSearch = await admin.get('/api/search?q=Searchable')
    expect(restoredSearch.status).toBe(200)
    const restoredBody = await restoredSearch.json<{ items: Array<{ id: string }>; total: number }>()
    expect(restoredBody.total).toBe(1)
    expect(restoredBody.items.map(i => i.id)).toContain(id)
  })

  it('bulk edit of a trashed entry reports not-found and never writes its multi-relation junction rows (#467)', async () => {
    const target = await admin.post('/api/content/bulk_rel_targets', { name: 'Tag A', slug: 'tag-a' })
    expect(target.status).toBe(201)
    const { id: targetId } = await target.json<{ id: string }>()

    const source = await admin.post('/api/content/bulk_rel_sources', { title: 'Source 1', slug: 'source-1' })
    expect(source.status).toBe(201)
    const { id: sourceId } = await source.json<{ id: string }>()

    const delRes = await admin.delete(`/api/content/bulk_rel_sources/${sourceId}`)
    expect(delRes.status).toBe(200)

    const bulkRes = await admin.patch('/api/content/bulk_rel_sources/bulk', {
      ids: [sourceId],
      fields: { tags: { mode: 'add', value: [targetId] } },
    })

    expect(bulkRes.status).toBe(200)
    const bulkBody = await bulkRes.json<{ updated: number; failed: Array<{ id: string; problem: { type: string } }> }>()
    expect(bulkBody.updated).toBe(0)
    expect(bulkBody.failed.map(f => f.id)).toEqual([sourceId])
    expect(bulkBody.failed[0].problem.type).toBe('content-not-found')

    const junctionRow = await harness.db
      .prepare('SELECT COUNT(*) AS n FROM rel_bulk_rel_sources_tags WHERE parent_id = ?')
      .bind(sourceId)
      .first<{ n: number }>()
    expect(junctionRow?.n).toBe(0)

    const restoreRes = await admin.post(`/api/content/bulk_rel_sources/${sourceId}/restore`)
    expect(restoreRes.status).toBe(200)

    const junctionRowAfterRestore = await harness.db
      .prepare('SELECT COUNT(*) AS n FROM rel_bulk_rel_sources_tags WHERE parent_id = ?')
      .bind(sourceId)
      .first<{ n: number }>()
    expect(junctionRowAfterRestore?.n).toBe(0)
  })
})
