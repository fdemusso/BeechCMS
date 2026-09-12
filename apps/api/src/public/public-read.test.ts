// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { EntryNotFoundError, type ContentRepository, type Seed, type ISeedRegistry } from '@beechcms/core'
import { readListEntries } from './read-list'
import { readSingleEntry } from './read-single'
import { publicReadHandler } from './public-read'
import type { AppEnv } from '../types.js'

function createMockRegistry(seeds: Seed[]): ISeedRegistry {
  return {
    all: () => seeds,
    get: (slug: string) => seeds.find((s) => s.slug === slug) ?? null,
    visibleInDashboard: () => seeds,
    publicReadable: () => seeds.filter((s) => s.allowPublicRead),
    draftEnabled: () => seeds.filter((s) => s.allowDrafts),
  }
}

describe('public-read module', () => {
  let mockRepo: ContentRepository
  let testSeed: Seed
  let getSeed: (slug: string) => Seed | null

  beforeEach(() => {
    vi.clearAllMocks()

    testSeed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      allowPublicRead: true,
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { public: true } },
        { id: 'br_02', alias: 'slug', label: 'Slug', type: 'text', policies: { public: true } },
      ],
    } as unknown as Seed

    getSeed = (slug: string) => {
      if (slug === 'posts') return testSeed
      return null
    }

    mockRepo = {
      findMany: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ContentRepository
  })

  describe('readListEntries', () => {
    it('returns paginated list with standard metadata', async () => {
      const items = [{ id: 'p-1', title: 'First', slug: 'first', status: 'published' }]
      vi.mocked(mockRepo.findMany).mockResolvedValueOnce({ items, total: 1 })

      const result = await readListEntries({
        seed: testSeed,
        seedSlug: 'posts',
        repository: mockRepo,
        query: { page: '1', limit: '10' },
        publishedOnly: true,
        getSeed,
      })

      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('p-1')
      expect(result.meta).toEqual(expect.objectContaining({ total: 1, page: 1, limit: 10, returned: 1, seed: 'posts' }))
    })

    it('handles all=true and latest=N query parameters', async () => {
      vi.mocked(mockRepo.findMany)
        .mockResolvedValueOnce({ items: [{ id: 'p-1', status: 'published' }], total: 1 })
        .mockResolvedValueOnce({ items: [{ id: 'p-2', status: 'published' }], total: 1 })

      const allResult = await readListEntries({
        seed: testSeed,
        seedSlug: 'posts',
        repository: mockRepo,
        query: { all: 'true' },
        publishedOnly: true,
        getSeed,
      })
      const latestResult = await readListEntries({
        seed: testSeed,
        seedSlug: 'posts',
        repository: mockRepo,
        query: { latest: '5' },
        publishedOnly: true,
        getSeed,
      })

      expect(allResult.data).toHaveLength(1)
      expect(latestResult.data).toHaveLength(1)
      expect(latestResult.meta).toEqual({ total: 1, returned: 1, seed: 'posts' })
    })
  })

  describe('readSingleEntry', () => {
    it('finds single entry by id or slug and projects fields', async () => {
      const entry = { id: 'p-1', slug: 'p-1-slug', title: 'One', status: 'published' }
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(entry)
      vi.mocked(mockRepo.findBySlug).mockResolvedValueOnce(entry)

      const byId = await readSingleEntry({
        seed: testSeed,
        seedSlug: 'posts',
        repository: mockRepo,
        id: 'p-1',
        slug: null,
        publishedOnly: true,
        query: {},
        getSeed,
      })
      const bySlug = await readSingleEntry({
        seed: testSeed,
        seedSlug: 'posts',
        repository: mockRepo,
        id: null,
        slug: 'p-1-slug',
        publishedOnly: true,
        query: {},
        getSeed,
      })

      expect(byId.ok).toBe(true)
      expect(bySlug.ok).toBe(true)
      if (byId.ok) expect(byId.data.id).toBe('p-1')
      if (bySlug.ok) expect(bySlug.data.slug).toBe('p-1-slug')
    })

    it('returns not found result if unpublished when publishedOnly is enabled', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce({ id: 'p-draft', status: 'draft' })

      const result = await readSingleEntry({
        seed: testSeed,
        seedSlug: 'posts',
        repository: mockRepo,
        id: 'p-draft',
        slug: null,
        publishedOnly: true,
        query: {},
        getSeed,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.detail).toBe("Entry 'p-draft' not found or not published.")
      }
    })

    it('catches EntryNotFoundError and returns not found result', async () => {
      vi.mocked(mockRepo.findById).mockRejectedValueOnce(new EntryNotFoundError("Entry 'missing' not found for content type 'posts'."))

      const result = await readSingleEntry({
        seed: testSeed,
        seedSlug: 'posts',
        repository: mockRepo,
        id: 'missing',
        slug: null,
        publishedOnly: true,
        query: {},
        getSeed,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.detail).toBe("Entry 'missing' not found for content type 'posts'.")
      }
    })
  })

  describe('publicReadHandler', () => {
    function buildTestApp() {
      const app = new Hono<AppEnv>()
      const mockRegistry = createMockRegistry([testSeed])
      app.use('*', async (c, next) => {
        c.set('seedRegistry', mockRegistry)
        c.set('getSeed', getSeed)
        c.set('repository', mockRepo)
        await next()
      })
      app.get('/api/v1/public/:seed', publicReadHandler)
      return app
    }

    it('returns 404 seed-not-found when requested seed does not exist', async () => {
      const app = buildTestApp()

      const response = await app.request('/api/v1/public/unknown_seed', {}, { PUBLIC_PUBLISHED_ONLY: 'true' })

      expect(response.status).toBe(404)
      const body = await response.json<{ type: string; title: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/seed-not-found')
    })

    it('returns 403 operation-not-allowed when allowPublicRead is false on seed', async () => {
      const privateSeed: Seed = {
        slug: 'private_content',
        label: 'Private',
        displayNameAlias: 'title',
        allowPublicRead: false,
        branches: [],
      } as unknown as Seed
      const app = new Hono<AppEnv>()
      const mockRegistry = createMockRegistry([privateSeed])
      app.use('*', async (c, next) => {
        c.set('seedRegistry', mockRegistry)
        c.set('getSeed', () => privateSeed)
        c.set('repository', mockRepo)
        await next()
      })
      app.get('/api/v1/public/:seed', publicReadHandler)

      const response = await app.request('/api/v1/public/private_content', {}, { PUBLIC_PUBLISHED_ONLY: 'true' })

      expect(response.status).toBe(403)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/operation-not-allowed')
    })

    it('returns 400 invalid-include Problem Details when include parameter fails validation', async () => {
      const app = buildTestApp()

      const response = await app.request('/api/v1/public/posts?include=non_existent', {}, { PUBLIC_PUBLISHED_ONLY: 'true' })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string; title: string; detail: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/invalid-include')
      expect(body.title).toBe('Invalid Include')
      expect(body.detail).toBe("Invalid include: branch 'non_existent' does not exist.")
    })

    it('returns 200 with list data on successful read request', async () => {
      const app = buildTestApp()
      vi.mocked(mockRepo.findMany).mockResolvedValueOnce({
        items: [{ id: 'post-1', title: 'Hello', slug: 'hello', status: 'published' }],
        total: 1,
      })

      const response = await app.request('/api/v1/public/posts', {}, { PUBLIC_PUBLISHED_ONLY: 'true' })

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { id: string }[]; meta: { total: number } }>()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].id).toBe('post-1')
      expect(body.meta.total).toBe(1)
    })

    it('reads single entry by id or slug successfully', async () => {
      const app = buildTestApp()
      const entry = { id: 'p-1', title: 'Single Post', slug: 'single-post', status: 'published' }
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(entry)
      vi.mocked(mockRepo.findBySlug).mockResolvedValueOnce(entry)

      const resById = await app.request('/api/v1/public/posts?id=p-1', {}, { PUBLIC_PUBLISHED_ONLY: 'true' })
      const resBySlug = await app.request('/api/v1/public/posts?slug=single-post', {}, { PUBLIC_PUBLISHED_ONLY: 'false' })

      expect(resById.status).toBe(200)
      expect(resBySlug.status).toBe(200)
      const bodyById = await resById.json<{ data: { id: string } }>()
      expect(bodyById.data.id).toBe('p-1')
    })

    it('returns 404 entry-not-found when single entry is missing', async () => {
      const app = buildTestApp()
      vi.mocked(mockRepo.findById).mockRejectedValueOnce(new EntryNotFoundError('Not found'))

      const response = await app.request('/api/v1/public/posts?id=missing-id', {}, { PUBLIC_PUBLISHED_ONLY: 'true' })

      expect(response.status).toBe(404)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/entry-not-found')
    })

    it('returns 400 invalid-filter Problem Details when filter syntax is invalid', async () => {
      const app = buildTestApp()
      vi.mocked(mockRepo.findMany).mockRejectedValueOnce(new Error('Invalid filter: malformed syntax'))

      const response = await app.request('/api/v1/public/posts?filter=malformed', {}, { PUBLIC_PUBLISHED_ONLY: 'true' })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string; title: string; detail: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/invalid-filter')
      expect(body.title).toBe('Bad Request')
      expect(body.detail).toBe('Invalid filter: malformed JSON')
    })

    it('returns 500 internal-server-error Problem Details on unexpected repository failures', async () => {
      const app = buildTestApp()
      vi.mocked(mockRepo.findMany).mockRejectedValueOnce(new Error('Database disk image is malformed'))

      const response = await app.request('/api/v1/public/posts', {}, { PUBLIC_PUBLISHED_ONLY: 'true' })

      expect(response.status).toBe(500)
      const body = await response.json<{ type: string; title: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/internal-server-error')
      expect(body.title).toBe('Internal Server Error')
    })
  })
})
