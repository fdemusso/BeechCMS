// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — integration tier. Covers the soft-delete/trash/purge HTTP surface against
 * real D1 through the full middleware chain: soft delete, restore (including the auto-rename
 * conflict path), purge, bulk variants, the trash list, lifecycle hooks, and reconciliation
 * against the deletion ledger. Media/R2 cleanup itself stays out of scope — the ledger write
 * uses a real (Miniflare-simulated) R2 binding (see vitest.workers.config.ts), never a fake.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, type BeechHooks } from '@beechcms/core'
import { createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const trashSeed = defineSeed({
  slug: 'trash_orders',
  label: 'Trash Order',
  labelPlural: 'Trash Orders',
  displayNameAlias: 'title',
  softDelete: true,
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
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

describe('content slice — soft delete integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let hooks: BeechHooks

  beforeEach(async () => {
    __resetSeedRegistryCache()
    hooks = { beforeDelete: vi.fn(), afterDelete: vi.fn() }
    harness = await createTestHarness({
      db: env.DB,
      seeds: [trashSeed, plainSeed],
      // Purge writes to the deletion ledger, which needs a working BeechBucket; the r2Buckets
      // binding in vitest.workers.config.ts provisions a real (simulated) one for this tier.
      env: { MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders, hooks }),
    })
    admin = await harness.asUser('admin')
  })

  it('DELETE on a soft-delete seed leaves the row in place with deleted_at set, absent from the list', async () => {
    const created = await admin.post('/api/content/trash_orders', { title: 'Order 1', slug: 'order-1' })
    expect(created.status).toBe(201)
    const { id } = await created.json<{ id: string }>()

    const response = await admin.delete(`/api/content/trash_orders/${id}`)

    expect(response.status).toBe(200)
    const body = await response.json<{ success: boolean; softDeleted: boolean }>()
    expect(body.softDeleted).toBe(true)

    const row = await harness.db.prepare('SELECT deleted_at FROM content_trash_orders WHERE id = ?').bind(id).first<{ deleted_at: number | null }>()
    expect(row?.deleted_at).not.toBeNull()

    const listResponse = await admin.get('/api/content/trash_orders')
    const items = await listResponse.json<Array<{ id: string }>>()
    expect(items.map(i => i.id)).not.toContain(id)
  })

  it('DELETE on a seed without softDelete still removes the row (no-regression guard)', async () => {
    const created = await admin.post('/api/content/plain_orders', { title: 'Plain 1', slug: 'plain-1' })
    expect(created.status).toBe(201)
    const { id } = await created.json<{ id: string }>()

    const response = await admin.delete(`/api/content/plain_orders/${id}`)

    expect(response.status).toBe(200)
    const body = await response.json<{ success: boolean; softDeleted: boolean }>()
    expect(body.softDeleted).toBe(false)

    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_plain_orders WHERE id = ?').bind(id).first<{ n: number }>()
    expect(row?.n).toBe(0)
  })

  it('POST /:slug/:id/restore clears deleted_at and the entry reappears in the list', async () => {
    const created = await admin.post('/api/content/trash_orders', { title: 'Order 2', slug: 'order-2' })
    const { id } = await created.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${id}`)

    const response = await admin.post(`/api/content/trash_orders/${id}/restore`)

    expect(response.status).toBe(200)
    const body = await response.json<{ success: boolean; slug: string }>()
    expect(body.slug).toBe('order-2')

    const row = await harness.db.prepare('SELECT deleted_at FROM content_trash_orders WHERE id = ?').bind(id).first<{ deleted_at: number | null }>()
    expect(row?.deleted_at).toBeNull()

    const listResponse = await admin.get('/api/content/trash_orders')
    const items = await listResponse.json<Array<{ id: string }>>()
    expect(items.map(i => i.id)).toContain(id)
  })

  it('restoring an entry whose slug was reassigned succeeds under a renamed slug', async () => {
    const first = await admin.post('/api/content/trash_orders', { title: 'Reused', slug: 'reused-slug' })
    const { id: firstId } = await first.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${firstId}`)

    const second = await admin.post('/api/content/trash_orders', { title: 'Reused Again', slug: 'reused-slug' })
    expect(second.status).toBe(201)
    const { id: secondId } = await second.json<{ id: string }>()

    const response = await admin.post(`/api/content/trash_orders/${firstId}/restore`)

    expect(response.status).toBe(200)
    const body = await response.json<{ success: boolean; slug: string }>()
    expect(body.slug).not.toBe('reused-slug')
    expect(body.slug).toContain('reused-slug-restored-')

    const rows = await harness.db.prepare('SELECT id, slug, deleted_at FROM content_trash_orders WHERE id IN (?, ?)').bind(firstId, secondId).all<{ id: string; slug: string; deleted_at: number | null }>()
    expect(rows.results).toHaveLength(2)
    for (const row of rows.results ?? []) {
      expect(row.deleted_at).toBeNull()
    }
  })

  it('DELETE ...?purge=true removes the row, its junction rows, and its _drafts row', async () => {
    const created = await admin.post('/api/content/trash_orders', { title: 'Purge Me', slug: 'purge-me' })
    const { id } = await created.json<{ id: string }>()
    await admin.put(`/api/content/trash_orders/${id}/draft`, { title: 'Draft edit' })

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

    const purgeTarget = await admin.post('/api/content/trash_orders', { title: 'Hook Purge', slug: 'hook-purge' })
    const { id: purgeId } = await purgeTarget.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${purgeId}?purge=true`)
    expect(hooks.beforeDelete).toHaveBeenCalledWith(purgeId, expect.anything())
    expect(hooks.afterDelete).toHaveBeenCalledWith(purgeId, expect.anything())

    const bulkTarget = await admin.post('/api/content/trash_orders', { title: 'Hook Bulk', slug: 'hook-bulk' })
    const { id: bulkId } = await bulkTarget.json<{ id: string }>()
    await admin.post('/api/content/trash_orders/trash/bulk-purge', { ids: [bulkId] })
    expect(hooks.beforeDelete).toHaveBeenCalledWith(bulkId, expect.anything())
    expect(hooks.afterDelete).toHaveBeenCalledWith(bulkId, expect.anything())
  })

  it('bulk-restore and bulk-purge report per-id outcomes and leave untouched ids untouched', async () => {
    const a = await admin.post('/api/content/trash_orders', { title: 'A', slug: 'bulk-a' })
    const { id: idA } = await a.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${idA}`)

    const b = await admin.post('/api/content/trash_orders', { title: 'B', slug: 'bulk-b' })
    const { id: idB } = await b.json<{ id: string }>()

    const restoreResponse = await admin.post('/api/content/trash_orders/trash/bulk-restore', { ids: [idA, 'not-an-id'] })
    expect(restoreResponse.status).toBe(200)
    const restoreBody = await restoreResponse.json<{ succeeded: string[]; failed: Array<{ id: string }> }>()
    expect(restoreBody.succeeded).toEqual([idA])
    expect(restoreBody.failed.map(f => f.id)).toEqual(['not-an-id'])

    const untouchedRow = await harness.db.prepare('SELECT id FROM content_trash_orders WHERE id = ?').bind(idB).first<{ id: string }>()
    expect(untouchedRow?.id).toBe(idB)

    const purgeResponse = await admin.post('/api/content/trash_orders/trash/bulk-purge', { ids: [idA] })
    expect(purgeResponse.status).toBe(200)
    const purgeBody = await purgeResponse.json<{ succeeded: string[] }>()
    expect(purgeBody.succeeded).toEqual([idA])

    const purgedRow = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_trash_orders WHERE id = ?').bind(idA).first<{ n: number }>()
    expect(purgedRow?.n).toBe(0)
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

  it('POST /:slug/trash/reconcile re-purges a row that exists in D1 but is recorded in the ledger', async () => {
    const created = await admin.post('/api/content/trash_orders', { title: 'Resurrected', slug: 'resurrected' })
    const { id } = await created.json<{ id: string }>()
    await admin.delete(`/api/content/trash_orders/${id}?purge=true`)

    // Simulates a D1 Time Travel restore: the row is back, but the R2 ledger (untouched by
    // any D1 restore) still records the erasure. entry_id must match UUID_V4_PATTERN, same
    // as production ids — this is a resurrection, not a hand-invented fixture shape.
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

  it('trash endpoints answer 409 content-soft-delete-disabled for a seed without softDelete', async () => {
    const response = await admin.get('/api/content/plain_orders/trash')

    expect(response.status).toBe(409)
    const body = await response.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/content-soft-delete-disabled')
  })
})
