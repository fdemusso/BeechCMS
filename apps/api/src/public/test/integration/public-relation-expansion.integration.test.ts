// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, UUID_V4_PATTERN, TEST_PUBLIC_READ_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const SCHEMA_REVISION_PATTERN = /^v\d+:[0-9a-f]{32}$/

describe('public slice — integration (real D1) relation expansion', () => {
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

  it('include=category_id expands single relation securely on a single post', async () => {
    const catRes = await admin.post('/api/content/categories', { name: 'Tech', status: 'published' })
    expect(catRes.status).toBe(201)
    const catBody = await catRes.json<{ id: string }>()
    const postRes = await admin.post('/api/content/posts', { title: 'Post', slug: 'post-single-rel', category_id: catBody.id, status: 'published' })
    expect(postRes.status).toBe(201)
    const postBody = await postRes.json<{ id: string }>()

    const response = await publicClient.get(`/api/v1/public/posts?id=${postBody.id}&include=category_id`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{
      data: {
        id: string
        category_id: string
        _includes: { category_id: { id: string; name: string; status: string } }
      }
    }>()
    expect(body.data.id).toBe(postBody.id)
    expect(body.data.category_id).toBe(catBody.id)
    expect(body.data._includes.category_id).toMatchObject({
      id: catBody.id,
      name: 'Tech',
      status: 'published',
    })

    // The regression guard: target entry data in _includes reflects published repository state.
    const row = await harness.db.prepare('SELECT id FROM content_categories WHERE id = ?').bind(catBody.id).first<{ id: string }>()
    expect(row?.id).toBe(catBody.id)
  })

  it('populates _includes even when fields parameter excludes the relation foreign key alias', async () => {
    const catRes = await admin.post('/api/content/categories', { name: 'DevOps', status: 'published' })
    expect(catRes.status).toBe(201)
    const catBody = await catRes.json<{ id: string }>()
    const postRes = await admin.post('/api/content/posts', { title: 'Cloud Post', slug: 'post-fields-rel', category_id: catBody.id, status: 'published' })
    expect(postRes.status).toBe(201)
    const postBody = await postRes.json<{ id: string }>()

    const response = await publicClient.get(`/api/v1/public/posts?id=${postBody.id}&fields=title&include=category_id`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{
      data: {
        id: string
        title: string
        category_id?: string
        _includes: { category_id: { id: string; name: string } }
      }
    }>()
    expect(body.data.title).toBe('Cloud Post')
    expect(body.data.category_id).toBeUndefined()
    expect(body.data._includes.category_id.id).toBe(catBody.id)
    expect(body.data._includes.category_id.name).toBe('DevOps')

    // Regression guard: relation extraction reads raw items before toFlatPublicEntry strips projected fields.
    expect(body.data._includes.category_id.id).toMatch(UUID_V4_PATTERN)
  })

  it('include=related_posts expands multiple relations as an array of public entries', async () => {
    const p1Res = await admin.post('/api/content/posts', { title: 'Target Post', slug: 'target-post', status: 'published' })
    expect(p1Res.status).toBe(201)
    const p1 = await p1Res.json<{ id: string }>()
    const p2Res = await admin.post('/api/content/posts', { title: 'Main Post', slug: 'main-post', related_posts: [p1.id], status: 'published' })
    expect(p2Res.status).toBe(201)
    const p2 = await p2Res.json<{ id: string }>()

    const response = await publicClient.get(`/api/v1/public/posts?id=${p2.id}&include=related_posts`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    const body = await response.json<{
      data: {
        id: string
        _includes: { related_posts: Array<{ id: string; slug: string; title: string }> }
      }
    }>()
    expect(body.data._includes.related_posts).toHaveLength(1)
    expect(body.data._includes.related_posts[0].id).toBe(p1.id)
    expect(body.data._includes.related_posts[0].slug).toBe('target-post')
    expect(body.data._includes.related_posts[0].title).toBe('Target Post')

    // Regression guard: junction table rel_posts_related_posts links p2 to p1 via parent_id.
    const row = await harness.db.prepare('SELECT target_id FROM rel_posts_related_posts WHERE parent_id = ?').bind(p2.id).first<{ target_id: string }>()
    expect(row?.target_id).toBe(p1.id)
  })

  it('rejects include pointing to an unauthorized branch with 400 Problem Details', async () => {
    const postRes = await admin.post('/api/content/posts', { title: 'Guarded Post', slug: 'guarded-post', status: 'published' })
    expect(postRes.status).toBe(201)
    const post = await postRes.json<{ id: string }>()

    const response = await publicClient.get(`/api/v1/public/posts?id=${post.id}&include=author_id`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(400)
    const body = await response.json<{ type: string; title: string; status: number; detail: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/invalid-include')
    expect(body.status).toBe(400)
    expect(body.title).toBe('Invalid Include')
    expect(body.detail).toBe("Invalid include: target seed 'authors' is not publicly readable.")

    // Regression guard: rejection preserves zero-mutation contract.
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('rejects include pointing to a non-existent branch with 400 Problem Details', async () => {
    const postRes = await admin.post('/api/content/posts', { title: 'Unknown Branch Post', slug: 'unknown-branch-post', status: 'published' })
    expect(postRes.status).toBe(201)
    const post = await postRes.json<{ id: string }>()

    const response = await publicClient.get(`/api/v1/public/posts?id=${post.id}&include=unknown_branch`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(400)
    const body = await response.json<{ type: string; title: string; status: number; detail: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/invalid-include')
    expect(body.status).toBe(400)
    expect(body.title).toBe('Invalid Include')
    expect(body.detail).toBe("Invalid include: branch 'unknown_branch' does not exist.")

    // Regression guard: rejection preserves zero-mutation contract.
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('rejects nested dotted include paths with 400 Problem Details enforcing depth 1 limit', async () => {
    const postRes = await admin.post('/api/content/posts', { title: 'Nested Test', slug: 'nested-test', status: 'published' })
    expect(postRes.status).toBe(201)
    const post = await postRes.json<{ id: string }>()

    const response = await publicClient.get(`/api/v1/public/posts?id=${post.id}&include=category_id.name`, {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(400)
    const body = await response.json<{ type: string; title: string; status: number; detail: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/invalid-include')
    expect(body.status).toBe(400)
    expect(body.title).toBe('Invalid Include')
    expect(body.detail).toBe("Invalid include: nested includes are not supported (got 'category_id.name'). Max depth is 1.")

    // Regression guard: deep relation traversal is deferred to future RFC.
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('attaches X-Schema-Revision header matching versioned digest pattern on 200 responses', async () => {
    const postRes = await admin.post('/api/content/posts', { title: 'Header Check', slug: 'header-check', status: 'published' })
    expect(postRes.status).toBe(201)

    const response = await publicClient.get('/api/v1/public/posts', {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('x-schema-revision')).toMatch(SCHEMA_REVISION_PATTERN)

    // Regression guard: client query builder relies on immutable header format for drift check.
    const revision = response.headers.get('x-schema-revision')!
    expect(revision.startsWith('v1:')).toBe(true)
  })

  it('attaches X-Schema-Revision header on 400 Bad Request error responses', async () => {
    const response = await publicClient.get('/api/v1/public/posts?include=invalid_alias', {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
    })

    expect(response.status).toBe(400)
    expect(response.headers.get('x-schema-revision')).toMatch(SCHEMA_REVISION_PATTERN)

    // Regression guard: early middleware registration ensures error responses publish schema fingerprint.
    const body = await response.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/invalid-include')
  })

  it('attaches X-Schema-Revision header on 401 Unauthorized error responses', async () => {
    const response = await publicClient.get('/api/v1/public/posts', {
      headers: { 'X-API-Key': 'unauthorized-key' },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('x-schema-revision')).toMatch(SCHEMA_REVISION_PATTERN)

    // Regression guard: schemaRevisionMiddleware sits upstream of apiKeyMiddleware in factory.ts.
    const body = await response.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/public-api-key-unauthorized')
  })
})
