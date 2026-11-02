// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — CRUD request contract, integration tier.
 * Covers what the route chain refuses and in which order: unknown seed first, then the body, then
 * whatever depends on the entry. The happy paths and the field-level rules live in the other
 * content suites (management, bulk validation, update conflict, localization, soft delete).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const PROBLEM = 'https://beechcms.dev/problems/'
const NOT_JSON = { body: '{not json' }

interface ProblemBody {
  type: string
}

describe('content slice — CRUD contract (real D1)', () => {
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

  async function createPost(slug: string): Promise<string> {
    const created = await admin.post('/api/content/posts', { title: 'Original', slug })
    expect(created.status).toBe(201) // precondition
    return (await created.json<{ id: string }>()).id
  }

  async function titleOf(id: string): Promise<string | undefined> {
    const row = await harness.db.prepare('SELECT title FROM content_posts WHERE id = ?').bind(id).first<{ title: string }>()
    return row?.title
  }

  async function postCount(): Promise<number> {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_posts').first<{ n: number }>()
    return row?.n ?? 0
  }

  async function expectProblem(response: Response, status: number, type: string) {
    expect(response.status).toBe(status)
    expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM}${type}`)
  }

  describe('an unknown seed', () => {
    // Regression guard: the seed lookup is a middleware ahead of zodJson / zodQuery. Swapped, a
    // malformed body would answer 400 here and a writer would learn the body contract of a missing seed.
    it.each([
      ['POST', '/api/content/no-such-seed'],
      ['PUT', '/api/content/no-such-seed/an-id'],
      ['PATCH', '/api/content/no-such-seed/bulk'],
      ['PATCH', '/api/content/no-such-seed/an-id/kanban-move'],
    ])('answers %s %s 404 content-seed-not-found before the body is read', async (method, path) => {
      const response = await admin.request(path, { method, headers: { 'Content-Type': 'application/json' }, ...NOT_JSON })

      await expectProblem(response, 404, 'content-seed-not-found')
    })

    it.each([
      ['GET', '/api/content/no-such-seed'],
      ['GET', '/api/content/no-such-seed/facets'],
      ['GET', '/api/content/no-such-seed/an-id'],
      ['DELETE', '/api/content/no-such-seed/an-id'],
    ])('answers %s %s 404 content-seed-not-found', async (method, path) => {
      const response = await admin.request(path, { method })

      await expectProblem(response, 404, 'content-seed-not-found')
    })
  })

  describe('POST /api/content/:slug', () => {
    it('a body that is not JSON is refused 400 content-invalid-json and nothing is created', async () => {
      const response = await admin.post('/api/content/posts', undefined, NOT_JSON)

      await expectProblem(response, 400, 'content-invalid-json')
      expect(await postCount()).toBe(0)
    })

    it('a JSON null is read as an empty body and refused by the field rules, not by the parser', async () => {
      const response = await admin.post('/api/content/posts', null)

      expect(response.status).toBe(400)
      expect((await response.json<ProblemBody>()).type).not.toBe(`${PROBLEM}content-invalid-json`)
      expect(await postCount()).toBe(0)
    })
  })

  describe('PUT /api/content/:slug/:id', () => {
    it('a body that is not JSON is refused 400 content-invalid-json and the entry is untouched', async () => {
      const id = await createPost('crud-put-json')

      const response = await admin.put(`/api/content/posts/${id}`, undefined, NOT_JSON)

      await expectProblem(response, 400, 'content-invalid-json')
      expect(await titleOf(id)).toBe('Original')
    })
  })

  describe('PATCH /api/content/:slug/bulk', () => {
    it('a body that is not JSON is refused 400 content-invalid-json and the entry is untouched', async () => {
      const id = await createPost('crud-bulk-json')

      const response = await admin.patch('/api/content/posts/bulk', undefined, NOT_JSON)

      await expectProblem(response, 400, 'content-invalid-json')
      expect(await titleOf(id)).toBe('Original')
    })

    it.each([[{}], [{ ids: [], fields: { title: 'x' } }], [{ ids: 'an-id', fields: { title: 'x' } }], [{ ids: [1], fields: { title: 'x' } }], [null], [[]]])(
      'a body of %j is refused 400 bulk-invalid-ids',
      async (payload) => {
        const id = await createPost('crud-bulk-ids')

        const response = await admin.patch('/api/content/posts/bulk', payload)

        await expectProblem(response, 400, 'bulk-invalid-ids')
        expect(await titleOf(id)).toBe('Original')
      },
    )

    it('more than 500 ids are refused 400 bulk-size-exceeded, ahead of the fields', async () => {
      const id = await createPost('crud-bulk-size')
      const ids = Array.from({ length: 501 }, (_, index) => `id-${index}`)

      const response = await admin.patch('/api/content/posts/bulk', { ids, fields: [] })

      await expectProblem(response, 400, 'bulk-size-exceeded')
      expect(await titleOf(id)).toBe('Original')
    })

    it('an oversized list holding a non-string id reads as bulk-invalid-ids, as the element check ran first', async () => {
      const ids: unknown[] = Array.from({ length: 501 }, (_, index) => `id-${index}`)
      ids[0] = 7

      const response = await admin.patch('/api/content/posts/bulk', { ids, fields: { title: 'x' } })

      await expectProblem(response, 400, 'bulk-invalid-ids')
    })

    it.each([[{ ids: ['an-id'] }], [{ ids: ['an-id'], fields: null }], [{ ids: ['an-id'], fields: ['title'] }], [{ ids: ['an-id'], fields: {} }]])(
      'a body of %j is refused 400 bulk-invalid-fields',
      async (payload) => {
        const response = await admin.patch('/api/content/posts/bulk', payload)

        await expectProblem(response, 400, 'bulk-invalid-fields')
      },
    )
  })

  describe('PATCH /api/content/:slug/:id/kanban-move', () => {
    // Regression guard: the body is checked before the entry is looked up, so a move with a bad
    // body for an entry that does not exist is a 400, not a 404.
    it('a bad body for an unknown entry is refused 400 content-invalid-body, not 404', async () => {
      const response = await admin.patch('/api/content/posts/no-such-entry/kanban-move', { position: '', axisBranchId: 'br_11' })

      await expectProblem(response, 400, 'content-invalid-body')
    })

    it('a body that is not JSON is refused 400 content-invalid-body', async () => {
      const response = await admin.patch('/api/content/posts/no-such-entry/kanban-move', undefined, NOT_JSON)

      await expectProblem(response, 400, 'content-invalid-body')
    })
  })
})
