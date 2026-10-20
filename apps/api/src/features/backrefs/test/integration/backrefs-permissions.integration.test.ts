// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

type BackrefsResponse = { groups: { sourceSlug: string; total: number; items: { id: string }[] }[] }

describe('backrefs slice — integration (real D1)', () => {
  let admin: TestClient
  let reader: TestClient
  let authorId: string
  let postId: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    const harness = await createTestHarness({ db: env.DB, createApp: authProviders => createBeechApp({ seeds: [], authProviders }) })
    admin = await harness.asUser('admin')
    reader = await harness.asUser('viewer')
    await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.viewer.id).run()
    await harness.db.prepare("INSERT OR IGNORE INTO roles (id, name) VALUES ('backrefs-reader', 'Backrefs Reader')").run()
    await harness.db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES ('backrefs-reader', 'content:read')").run()
    await harness.db.prepare("INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('backrefs-author-reader', ?, 'backrefs-reader', 'authors')").bind(CANONICAL_USERS.viewer.id).run()
    const author = await admin.post('/api/content/authors', { name: 'Canonical Author', status: 'published' })
    expect(author.status).toBe(201)
    authorId = (await author.json<{ id: string }>()).id
    const post = await admin.post('/api/content/posts', { title: 'Canonical Post', author_id: authorId, status: 'published' })
    expect(post.status).toBe(201)
    postId = (await post.json<{ id: string }>()).id
  })

  // Target grants cannot authorize sources.
  it('omits unreadable source groups from previews', async () => {
    const response = await reader.get(`/api/content/authors/${authorId}/backrefs`)

    expect(response.status).toBe(200)
    const body = await response.json<BackrefsResponse>()
    expect(body.groups).toEqual([])
  })

  it('returns not-found for an unreadable paginated source group', async () => {
    const response = await reader.get(`/api/content/authors/${authorId}/backrefs?group=posts:author_id&page=2`)

    expect(response.status).toBe(404)
    const body = await response.json<{ type: string }>()
    expect(body.type).toContain('not-found')
  })

  it('retains source groups with seed-scoped read permission', async () => {
    await env.DB.prepare("INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('backrefs-post-reader', ?, 'backrefs-reader', 'posts')").bind(CANONICAL_USERS.viewer.id).run()

    const response = await reader.get(`/api/content/authors/${authorId}/backrefs`)

    expect(response.status).toBe(200)
    const body = await response.json<BackrefsResponse>()
    expect(body.groups).toHaveLength(1)
    expect(body.groups[0]).toMatchObject({ sourceSlug: 'posts', total: 1, items: [{ id: postId }] })
  })

  it.each(['', '?group=posts:author_id'])('retains source groups with global read permission for %s', async query => {
    const response = await admin.get(`/api/content/authors/${authorId}/backrefs${query}`)

    expect(response.status).toBe(200)
    const body = await response.json<BackrefsResponse>()
    expect(body.groups).toHaveLength(1)
    expect(body.groups[0]).toMatchObject({ sourceSlug: 'posts', total: 1, items: [{ id: postId }] })
  })
})
