// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { describe, it, expect } from 'vitest'
import { defineSeed } from '@beechcms/core'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticAutomationRepository } from './mocks/static-automation.repository'
import { TEST_ENV, TEST_PUBLIC_READ_KEY, TEST_PUBLIC_WRITE_KEY } from './fixtures'
import { createBeechBrowserClient } from '../../../packages/client/src/browser/index.js'
import { createBeechServerClient } from '../../../packages/client/src/server/index.js'

describe('End-to-End: @beechcms/client SDK with Real BeechCMS API Engine', () => {
  const articlesSeed = defineSeed({
    slug: 'articles',
    label: 'Articles',
    displayNameAlias: 'title',
    allowPublicRead: true,
    allowPublicPost: true,
    allowPublicEdit: true,
    branches: [
      { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { classification: 'public' } },
      { id: 'br_02', alias: 'category', label: 'Category', type: 'text', policies: { classification: 'public' } },
      { id: 'br_03', alias: 'views', label: 'Views', type: 'number', policies: { classification: 'public' } },
    ],
  })

  const initialArticles = [
    {
      id: 'a0000000-0000-4000-8000-000000000001',
      slug: 'intro-to-beech',
      status: 'published',
      title: 'Introduction to BeechCMS',
      category: 'technology',
      views: 150,
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: 'a0000000-0000-4000-8000-000000000002',
      slug: 'advanced-patterns',
      status: 'published',
      title: 'Advanced Edge Patterns',
      category: 'architecture',
      views: 320,
      created_at: 2000,
      updated_at: 2000,
    },
  ]

  const repo = new StaticContentRepository([articlesSeed])
  repo.load('articles', [...initialArticles])

  const app = createBeechApp({
    seeds: [articlesSeed],
    repository: repo,
    automationRepository: new StaticAutomationRepository(),
  })

  // Bridge client requests to Hono app in-memory
  const appFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
    return app.request(url, init as any, TEST_ENV)
  }

  interface Article {
    id: string
    slug: string
    title: string
    category: string
    views: number
    status: string
  }

  interface AppRegistry {
    articles: Article
  }

  describe('Browser Client (@beechcms/client/browser)', () => {
    const browserClient = createBeechBrowserClient<AppRegistry>({
      baseUrl: 'https://api.beechcms.local',
      apiKey: TEST_PUBLIC_READ_KEY,
      fetch: appFetch,
    })

    it('lists published articles with filters and sort', async () => {
      const result = await browserClient.content('articles').list({
        filter: {
          category: { eq: 'technology' },
        },
      })

      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(result.data!.data).toHaveLength(1)
      expect(result.data!.data[0].slug).toBe('intro-to-beech')
      expect(result.data!.meta.seed).toBe('articles')
    })

    it('fetches a single article by slug', async () => {
      const result = await browserClient.content('articles').get({ slug: 'advanced-patterns' })
      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(result.data!.data.title).toBe('Advanced Edge Patterns')
      expect(result.data!.data.views).toBe(320)
    })

    it('fetches a single article by UUID', async () => {
      const result = await browserClient.content('articles').get({ id: 'a0000000-0000-4000-8000-000000000001' })
      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(result.data!.data.slug).toBe('intro-to-beech')
    })

    it('returns RFC 9457 problem on missing article without throwing', async () => {
      const result = await browserClient.content('articles').get({ slug: 'non-existent' })
      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.error!.status).toBe(404)
    })
  })

  describe('Server Client (@beechcms/client/server)', () => {
    const serverClient = createBeechServerClient<AppRegistry>({
      baseUrl: 'https://api.beechcms.local',
      apiKey: TEST_PUBLIC_WRITE_KEY,
      fetch: appFetch,
    })

    it('creates content using flat payload and bypasses Time-Trap anti-bot via PUBLIC_WRITE_API_KEY', async () => {
      const result = await serverClient.content('articles').create({
        title: 'Brand New Post',
        slug: 'brand-new-post',
        category: 'news',
        views: 10,
        status: 'published',
      })

      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      // Verifies result.data.data.id and result.data.data.title work as documented
      expect(result.data!.data.id).toBeDefined()
      expect(result.data!.data.title).toBe('Brand New Post')
      expect(result.data!.meta.seed).toBe('articles')
    })

    it('updates content using flat payload and receives updated entity in result.data.data', async () => {
      const result = await serverClient.content('articles').update(
        'a0000000-0000-4000-8000-000000000002',
        {
          title: 'Advanced Edge Patterns (Updated Edition)',
          views: 999,
        },
      )

      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(result.data!.data.title).toBe('Advanced Edge Patterns (Updated Edition)')
      expect(result.data!.data.views).toBe(999)
      expect(result.data!.meta.seed).toBe('articles')
    })

    it('returns 401 Unauthorized when invalid API key is provided on server operations', async () => {
      const unauthorizedClient = createBeechServerClient<AppRegistry>({
        baseUrl: 'https://api.beechcms.local',
        apiKey: 'invalid-secret-key',
        fetch: appFetch,
      })

      const result = await unauthorizedClient.content('articles').create({
        title: 'Malicious Post',
      })

      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.error!.status).toBe(401)
    })
  })
})
