// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — integration tier. Covers the soft-delete isolation guarantee: a trashed
 * entry must be unreachable from every Public API read path — list, single read, relation
 * include, and relation subquery — not just the one this sprint patched directly.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, TEST_PUBLIC_READ_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

// A standalone soft-delete seed for the direct list/read isolation checks.
const sdTarget = defineSeed({
  slug: 'sd_target',
  label: 'SD Target',
  displayNameAlias: 'name',
  softDelete: true,
  allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true, policies: { public: true } },
  ],
})

// Referrer with a multi-relation to sdTarget — the `?include=` absent-from-array case needs
// the TARGET seed to be soft-delete-enabled, not the referrer.
const sdReferrer = defineSeed({
  slug: 'sd_referrer',
  label: 'SD Referrer',
  displayNameAlias: 'title',
  allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
    { id: 'br_02', alias: 'targets', label: 'Targets', type: 'relation', targetSeed: 'sd_target', multiple: true, policies: { public: true } },
  ],
})

// Child target for the subquery guard: here it's the PARENT (sdParent, the multi-relation
// owner reached by findParentIdsByRelation) that must be soft-delete-enabled.
const sdChild = defineSeed({
  slug: 'sd_child',
  label: 'SD Child',
  displayNameAlias: 'name',
  allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true, policies: { public: true } },
  ],
})

const sdParent = defineSeed({
  slug: 'sd_parent',
  label: 'SD Parent',
  displayNameAlias: 'title',
  softDelete: true,
  allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
    { id: 'br_02', alias: 'children', label: 'Children', type: 'relation', targetSeed: 'sd_child', multiple: true, policies: { public: true } },
  ],
})

describe('public slice — integration (real D1) soft-delete isolation', () => {
  let harness: TestHarness
  let admin: TestClient
  let publicClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [sdTarget, sdReferrer, sdChild, sdParent],
      // Purge (via DELETE) writes to the deletion ledger, which needs a working BeechBucket.
      // r2Buckets: ['MEDIA_BUCKET'] in vitest.workers.config.ts provisions a real (simulated)
      // R2 binding here; Cloudflare.Env's generated types don't know about it since it isn't
      // declared in wrangler.jsonc, hence the cast.
      env: { MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    publicClient = harness.anonymous()
  })

  it('GET /api/v1/public/:seed omits a trashed entry', async () => {
    const created = await admin.post('/api/content/sd_target', { name: 'Visible', slug: 'visible', status: 'published' })
    expect(created.status).toBe(201)
    const trashedCreated = await admin.post('/api/content/sd_target', { name: 'Hidden', slug: 'hidden', status: 'published' })
    expect(trashedCreated.status).toBe(201)
    const { id: trashedId } = await trashedCreated.json<{ id: string }>()

    const deleteRes = await admin.delete(`/api/content/sd_target/${trashedId}`)
    expect(deleteRes.status).toBe(200)

    const response = await publicClient.get('/api/v1/public/sd_target', {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{ data: Array<{ id: string }> }>()
    expect(body.data.map(d => d.id)).not.toContain(trashedId)
  })

  it('GET /api/v1/public/:seed/:idOrSlug answers 404 for a trashed entry', async () => {
    const created = await admin.post('/api/content/sd_target', { name: 'ToTrash', slug: 'to-trash', status: 'published' })
    expect(created.status).toBe(201)
    const { id } = await created.json<{ id: string }>()

    const deleteRes = await admin.delete(`/api/content/sd_target/${id}`)
    expect(deleteRes.status).toBe(200)

    const response = await publicClient.get(`/api/v1/public/sd_target?id=${id}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(404)
  })

  it('?include= resolves a trashed multi-relation target as absent from the expanded array', async () => {
    const targetRes = await admin.post('/api/content/sd_target', { name: 'WillBeTrashed', slug: 'will-be-trashed', status: 'published' })
    expect(targetRes.status).toBe(201)
    const target = await targetRes.json<{ id: string }>()
    const keptRes = await admin.post('/api/content/sd_target', { name: 'Kept', slug: 'kept', status: 'published' })
    expect(keptRes.status).toBe(201)
    const kept = await keptRes.json<{ id: string }>()

    const referrerRes = await admin.post('/api/content/sd_referrer', {
      title: 'Referrer', slug: 'referrer', status: 'published', targets: [target.id, kept.id],
    })
    expect(referrerRes.status).toBe(201)
    const referrer = await referrerRes.json<{ id: string }>()

    const deleteRes = await admin.delete(`/api/content/sd_target/${target.id}`)
    expect(deleteRes.status).toBe(200)

    const response = await publicClient.get(`/api/v1/public/sd_referrer?id=${referrer.id}&include=targets`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{ data: { targets: string[]; _includes: { targets: Array<{ id: string }> } } }>()
    // Raw FK value on the parent still lists both ids — only the expansion drops the trashed one.
    expect(body.data.targets).toEqual(expect.arrayContaining([target.id, kept.id]))
    expect(body.data._includes.targets.map(t => t.id)).toEqual([kept.id])
  })

  it('a relation subquery never matches through a trashed parent', async () => {
    // Regression guard for the findParentIdsByRelation join guard (T10.1): without the guard,
    // a trashed sd_parent's junction row would still resolve, leaking a trashed entry's id
    // through the multi-relation subquery path.
    const childRes = await admin.post('/api/content/sd_child', { name: 'ChildTarget', slug: 'child-target', status: 'published' })
    expect(childRes.status).toBe(201)
    const child = await childRes.json<{ id: string }>()

    const parentRes = await admin.post('/api/content/sd_parent', {
      title: 'ParentToTrash', slug: 'parent-to-trash', status: 'published', children: [child.id],
    })
    expect(parentRes.status).toBe(201)
    const parent = await parentRes.json<{ id: string }>()

    const deleteRes = await admin.delete(`/api/content/sd_parent/${parent.id}`)
    expect(deleteRes.status).toBe(200)

    const filter = JSON.stringify({ where: [{ field: 'children', op: 'in', value: { where: [{ field: 'name', op: 'eq', value: 'ChildTarget' }] } }] })
    const response = await publicClient.get(`/api/v1/public/sd_parent?filter=${encodeURIComponent(filter)}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{ data: unknown[]; meta: { total: number } }>()
    expect(body.data).toEqual([])
    expect(body.meta.total).toBe(0)

    // Regression guard: the junction row itself is untouched by soft delete — only the read
    // path must exclude it. Confirms the guard lives in the join, not in the write path.
    const row = await harness.db
      .prepare('SELECT COUNT(*) AS n FROM rel_sd_parent_children WHERE parent_id = ?')
      .bind(parent.id)
      .first<{ n: number }>()
    expect(row?.n).toBe(1)
  })
})
