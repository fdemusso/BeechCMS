// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { TEST_SEEDS, TEST_ENV, TEST_PUBLIC_READ_KEY } from './fixtures'

describe('Public API Routes', () => {
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    const repo = new StaticContentRepository(TEST_SEEDS)
    const idempotencyRepo = new StaticIdempotencyRepository()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo })
  })

  it('GET /api/v1/public/health returns 200 ok', async () => {
    const res = await app.request('/api/v1/public/health', {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY }
    }, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, service: 'public-api' })
  })

  it('GET /api/v1/public/schema returns JSON schema of public seeds', async () => {
    const res = await app.request('/api/v1/public/schema', {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY }
    }, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json<{ seeds: any[] }>()
    expect(body.seeds.length).toBeGreaterThan(0)
    
    const postSeed = body.seeds.find(s => s.slug === 'posts')
    expect(postSeed).toBeDefined()
    expect(postSeed.allowPublicRead).toBe(true)
    expect(postSeed.allowPublicPost).toBe(true)
    expect(postSeed.allowPublicEdit).toBe(true)

    // Check branch policies coverage
    const titleBranch = postSeed.branches.find((b: any) => b.alias === 'title')
    expect(titleBranch.policies.public).toBe(true)
    expect(titleBranch.policies.visibility).toBe('full')
  })

  it('GET /api/v1/public/schema.html returns HTML documentation', async () => {
    const res = await app.request('/api/v1/public/schema.html', {
      headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY }
    }, TEST_ENV)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('BeechCMS — Public API Schema')
    expect(html).toContain('posts')
  })

  describe('CORS same-origin fallback', () => {
    it('allows same-origin requests with matching protocol, hostname, and port', async () => {
      const res = await app.request('https://cms.example.com/api/v1/public/health', {
        headers: {
          'X-API-Key': TEST_PUBLIC_READ_KEY,
          'Origin': 'https://cms.example.com',
        }
      }, { ...TEST_ENV, CORS_ORIGINS: '' })
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://cms.example.com')
    })

    it('rejects same-origin requests with different protocols (HTTP origin on HTTPS deployment)', async () => {
      const res = await app.request('https://cms.example.com/api/v1/public/health', {
        headers: {
          'X-API-Key': TEST_PUBLIC_READ_KEY,
          'Origin': 'http://cms.example.com',
        }
      }, { ...TEST_ENV, CORS_ORIGINS: '' })
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    })
  })
})
