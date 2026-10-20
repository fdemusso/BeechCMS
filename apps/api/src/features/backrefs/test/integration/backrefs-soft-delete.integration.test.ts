// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Backrefs slice — soft-delete / trash isolation (Issue #466), integration tier.
 * Verifies that trashed (soft-deleted) entries are excluded from backref listings
 * and totals for both single and multi relations, and that a trashed target entry
 * returns 404.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const authorsSeed = defineSeed({
  slug: 'sd_br_authors',
  label: 'Author',
  displayNameAlias: 'name',
  softDelete: true,
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text' },
  ],
})

const postsSeed = defineSeed({
  slug: 'sd_br_posts',
  label: 'Post',
  displayNameAlias: 'title',
  softDelete: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'sd_br_authors' },
  ],
})

const articlesSeed = defineSeed({
  slug: 'sd_br_articles',
  label: 'Article',
  displayNameAlias: 'title',
  softDelete: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'authors', label: 'Authors', type: 'relation', targetSeed: 'sd_br_authors', multiple: true },
  ],
})

describe('backrefs slice — soft delete isolation (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [authorsSeed, postsSeed, articlesSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  it('excludes soft-deleted source entries from single-relation backref list and total', async () => {
    const authorRes = await admin.post('/api/content/sd_br_authors', { name: 'Alice', status: 'published' })
    expect(authorRes.status).toBe(201)
    const { id: authorId } = await authorRes.json<{ id: string }>()

    const postRes1 = await admin.post('/api/content/sd_br_posts', {
      title: 'Post 1',
      author_id: authorId,
      status: 'published',
    })
    expect(postRes1.status).toBe(201)
    const { id: postId1 } = await postRes1.json<{ id: string }>()

    const postRes2 = await admin.post('/api/content/sd_br_posts', {
      title: 'Post 2',
      author_id: authorId,
      status: 'published',
    })
    expect(postRes2.status).toBe(201)
    const { id: postId2 } = await postRes2.json<{ id: string }>()

    const beforeRes = await admin.get(`/api/content/sd_br_authors/${authorId}/backrefs`)
    expect(beforeRes.status).toBe(200)
    const beforeBody = await beforeRes.json<{ groups: { total: number; items: { id: string }[] }[] }>()
    const beforeGroup = beforeBody.groups.find(g => g.items.some(item => item.id === postId1))
    expect(beforeGroup?.total).toBe(2)
    expect(beforeGroup?.items).toHaveLength(2)

    const delRes = await admin.delete(`/api/content/sd_br_posts/${postId1}`)
    expect(delRes.status).toBe(200)

    const afterRes = await admin.get(`/api/content/sd_br_authors/${authorId}/backrefs`)
    expect(afterRes.status).toBe(200)
    const afterBody = await afterRes.json<{ groups: { total: number; items: { id: string }[] }[] }>()
    const afterGroup = afterBody.groups.find(g => g.items.some(item => item.id === postId2))
    expect(afterGroup?.total).toBe(1)
    expect(afterGroup?.items.map(i => i.id)).toEqual([postId2])
    expect(afterGroup?.items.map(i => i.id)).not.toContain(postId1)

    const groupRes = await admin.get(`/api/content/sd_br_authors/${authorId}/backrefs?group=sd_br_posts:author_id`)
    expect(groupRes.status).toBe(200)
    const groupBody = await groupRes.json<{ groups: { total: number; items: { id: string }[] }[] }>()
    expect(groupBody.groups[0].total).toBe(1)
    expect(groupBody.groups[0].items.map(i => i.id)).toEqual([postId2])
    expect(groupBody.groups[0].items.map(i => i.id)).not.toContain(postId1)
  })

  it('excludes soft-deleted source entries from multi-relation backref list and total', async () => {
    const authorRes = await admin.post('/api/content/sd_br_authors', { name: 'Bob', status: 'published' })
    expect(authorRes.status).toBe(201)
    const { id: authorId } = await authorRes.json<{ id: string }>()

    const articleRes1 = await admin.post('/api/content/sd_br_articles', {
      title: 'Article 1',
      authors: [authorId],
      status: 'published',
    })
    expect(articleRes1.status).toBe(201)
    const { id: articleId1 } = await articleRes1.json<{ id: string }>()

    const articleRes2 = await admin.post('/api/content/sd_br_articles', {
      title: 'Article 2',
      authors: [authorId],
      status: 'published',
    })
    expect(articleRes2.status).toBe(201)
    const { id: articleId2 } = await articleRes2.json<{ id: string }>()

    const beforeRes = await admin.get(`/api/content/sd_br_authors/${authorId}/backrefs`)
    expect(beforeRes.status).toBe(200)
    const beforeBody = await beforeRes.json<{ groups: { total: number; items: { id: string }[] }[] }>()
    const beforeGroup = beforeBody.groups.find(g => g.items.some(item => item.id === articleId1))
    expect(beforeGroup?.total).toBe(2)
    expect(beforeGroup?.items).toHaveLength(2)

    const delRes = await admin.delete(`/api/content/sd_br_articles/${articleId1}`)
    expect(delRes.status).toBe(200)

    const afterRes = await admin.get(`/api/content/sd_br_authors/${authorId}/backrefs`)
    expect(afterRes.status).toBe(200)
    const afterBody = await afterRes.json<{ groups: { total: number; items: { id: string }[] }[] }>()
    const afterGroup = afterBody.groups.find(g => g.items.some(item => item.id === articleId2))
    expect(afterGroup?.total).toBe(1)
    expect(afterGroup?.items.map(i => i.id)).toEqual([articleId2])
    expect(afterGroup?.items.map(i => i.id)).not.toContain(articleId1)

    const groupRes = await admin.get(`/api/content/sd_br_authors/${authorId}/backrefs?group=sd_br_articles:authors`)
    expect(groupRes.status).toBe(200)
    const groupBody = await groupRes.json<{ groups: { total: number; items: { id: string }[] }[] }>()
    expect(groupBody.groups[0].total).toBe(1)
    expect(groupBody.groups[0].items.map(i => i.id)).toEqual([articleId2])
    expect(groupBody.groups[0].items.map(i => i.id)).not.toContain(articleId1)
  })

  it('returns 404 when target entry itself has been soft-deleted', async () => {
    const authorRes = await admin.post('/api/content/sd_br_authors', { name: 'Charlie', status: 'published' })
    expect(authorRes.status).toBe(201)
    const { id: authorId } = await authorRes.json<{ id: string }>()

    const delRes = await admin.delete(`/api/content/sd_br_authors/${authorId}`)
    expect(delRes.status).toBe(200)

    const res = await admin.get(`/api/content/sd_br_authors/${authorId}/backrefs`)
    expect(res.status).toBe(404)
  })
})
