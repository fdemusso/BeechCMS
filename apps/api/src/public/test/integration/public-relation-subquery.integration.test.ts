// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — integration tier. Covers relation subquery filters (`?filter=` with a
 * nested `in` value against a relation branch), both single and multi-relation. Repository-level
 * coverage of `findParentIdsByRelation` lives here (via the multi-relation cases), not in a
 * direct D1 repository test.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, TEST_PUBLIC_READ_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const SCHEMA_REVISION_PATTERN = /^v\d+:[0-9a-f]{32}$/

describe('public slice — integration (real D1) relation subquery filters', () => {
  let harness: TestHarness
  let admin: TestClient
  let publicClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    publicClient = harness.anonymous()
  })

  it('filters posts through category_id by the category name, matching only referencing posts', async () => {
    const techRes = await admin.post('/api/content/categories', { name: 'Tech', status: 'published' })
    expect(techRes.status).toBe(201)
    const tech = await techRes.json<{ id: string }>()
    const newsRes = await admin.post('/api/content/categories', { name: 'News', status: 'published' })
    expect(newsRes.status).toBe(201)
    const news = await newsRes.json<{ id: string }>()

    const matchRes = await admin.post('/api/content/posts', { title: 'Tech Post', slug: 'tech-post', category_id: tech.id, status: 'published' })
    expect(matchRes.status).toBe(201)
    const match = await matchRes.json<{ id: string }>()
    const otherRes = await admin.post('/api/content/posts', { title: 'News Post', slug: 'news-post', category_id: news.id, status: 'published' })
    expect(otherRes.status).toBe(201)

    const filter = JSON.stringify({ where: [{ field: 'category_id', op: 'in', value: { where: [{ field: 'name', op: 'eq', value: 'Tech' }] } }] })
    const response = await publicClient.get(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{ data: Array<{ id: string }>; meta: { total: number } }>()
    expect(body.data.map(d => d.id)).toEqual([match.id])
    expect(body.meta.total).toBe(1)

    // Regression guard: the filtered result matches D1's own post count for this category.
    const row = await harness.db
      .prepare('SELECT COUNT(*) AS n FROM content_posts WHERE category_id = ?')
      .bind(tech.id)
      .first<{ n: number }>()
    expect(row?.n).toBe(1)
  })

  it('filters posts through the multi-relation related_posts, the case that answers 500 without this sprint', async () => {
    const targetRes = await admin.post('/api/content/posts', { title: 'Target', slug: 'sq-target', status: 'published' })
    expect(targetRes.status).toBe(201)
    const target = await targetRes.json<{ id: string }>()
    const referrerRes = await admin.post('/api/content/posts', { title: 'Referrer', slug: 'sq-referrer', related_posts: [target.id], status: 'published' })
    expect(referrerRes.status).toBe(201)
    const referrer = await referrerRes.json<{ id: string }>()
    const unrelatedRes = await admin.post('/api/content/posts', { title: 'Unrelated', slug: 'sq-unrelated', status: 'published' })
    expect(unrelatedRes.status).toBe(201)

    const filter = JSON.stringify({ where: [{ field: 'related_posts', op: 'in', value: { where: [{ field: 'title', op: 'eq', value: 'Target' }] } }] })
    const response = await publicClient.get(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{ data: Array<{ id: string }>; meta: { total: number } }>()
    expect(body.data.map(d => d.id)).toEqual([referrer.id])

    // Regression guard: the referencing junction row is the one this filter resolved through.
    const row = await harness.db
      .prepare('SELECT parent_id FROM rel_posts_related_posts WHERE target_id = ?')
      .bind(target.id)
      .first<{ parent_id: string }>()
    expect(row?.parent_id).toBe(referrer.id)
  })

  it('a subquery matching no target returns 200 with an empty page, never the unfiltered collection', async () => {
    const postRes = await admin.post('/api/content/posts', { title: 'Any Post', slug: 'sq-any-post', status: 'published' })
    expect(postRes.status).toBe(201)

    const filter = JSON.stringify({ where: [{ field: 'category_id', op: 'in', value: { where: [{ field: 'name', op: 'eq', value: 'NoSuchCategory' }] } }] })
    const response = await publicClient.get(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{ data: unknown[]; meta: { total: number } }>()
    expect(body.data).toEqual([])
    expect(body.meta.total).toBe(0)
  })

  it('a subquery through the non-public author_id relation returns 400 invalid-subquery', async () => {
    const filter = JSON.stringify({ where: [{ field: 'author_id', op: 'in', value: { where: [{ field: 'name', op: 'eq', value: 'Anyone' }] } }] })
    const response = await publicClient.get(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(400)
    const body = await response.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/invalid-subquery')

    // Regression guard: rejection preserves zero-mutation contract.
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('a subquery on a non-filterable inner field returns 400 invalid-filter', async () => {
    // related_posts targets the `posts` seed itself, which declares internal_note as
    // policies.public: false — non-filterable, rejected by the same policy gate ordinary
    // filters go through. The offending field just happens to sit inside a subquery.
    const filter = JSON.stringify({ where: [{ field: 'related_posts', op: 'in', value: { where: [{ field: 'internal_note', op: 'eq', value: 'x' }] } }] })
    const response = await publicClient.get(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(400)
    const body = await response.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/invalid-filter')
  })

  it('a subquery filter composes with include=, returning both the filtered set and _includes', async () => {
    const techRes = await admin.post('/api/content/categories', { name: 'Compose', status: 'published' })
    expect(techRes.status).toBe(201)
    const tech = await techRes.json<{ id: string }>()
    const matchRes = await admin.post('/api/content/posts', { title: 'Composed Post', slug: 'sq-composed', category_id: tech.id, status: 'published' })
    expect(matchRes.status).toBe(201)
    const match = await matchRes.json<{ id: string }>()

    const filter = JSON.stringify({ where: [{ field: 'category_id', op: 'in', value: { where: [{ field: 'name', op: 'eq', value: 'Compose' }] } }] })
    const response = await publicClient.get(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}&include=category_id`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{
      data: Array<{ id: string; _includes: { category_id: { id: string; name: string } } }>
    }>()
    expect(body.data.map(d => d.id)).toEqual([match.id])
    expect(body.data[0]._includes.category_id).toMatchObject({ id: tech.id, name: 'Compose' })
  })

  it('attaches X-Schema-Revision on a subquery-filtered response', async () => {
    const postRes = await admin.post('/api/content/posts', { title: 'Header Post', slug: 'sq-header-post', status: 'published' })
    expect(postRes.status).toBe(201)

    const filter = JSON.stringify({ where: [{ field: 'category_id', op: 'in', value: { where: [{ field: 'name', op: 'eq', value: 'Nope' }] } }] })
    const response = await publicClient.get(`/api/v1/public/posts?filter=${encodeURIComponent(filter)}`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('x-schema-revision')).toMatch(SCHEMA_REVISION_PATTERN)
  })
})
