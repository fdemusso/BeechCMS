// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — add status and access integration tier. An anonymous submission is untrusted and must land
 * unpublished unless the owner opts in; a write made with the secret key is trusted and does not depend on
 * the anonymous-submission flag. Real D1 through the harness, so the persisted status is what is asserted.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, generateTimeTrapToken } from '@beechcms/core'
import { createTestHarness, TEST_PUBLISHABLE_KEY, TEST_SECRET_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const TIME_TRAP_SECRET = 'status-test-time-trap-secret-0123456789'
const PROBLEM_BASE = 'https://beechcms.dev/problems/'

const titleBranch = { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } } as const

const blogSeed = defineSeed({ slug: 'blog', label: 'Blog', displayNameAlias: 'title', allowPublicRead: true, allowPublicPost: true, branches: [titleBranch] })
const noticesSeed = defineSeed({ slug: 'notices', label: 'Notices', displayNameAlias: 'title', allowPublicRead: true, allowPublicPost: true, defaultPublicStatus: 'published', branches: [titleBranch] })
const archiveSeed = defineSeed({ slug: 'archive', label: 'Archive', displayNameAlias: 'title', allowPublicRead: true, branches: [titleBranch] })
const vaultSeed = defineSeed({ slug: 'vault', label: 'Vault', displayNameAlias: 'title', branches: [titleBranch] })

interface PublicList {
  data: Array<{ title: string }>
  meta: { total: number }
}

describe('public slice — add status and access (real D1)', () => {
  let harness: TestHarness
  let anonymous: TestClient
  let secretClient: TestClient
  let publishableClient: TestClient

  async function anonymousToken(): Promise<string> {
    return generateTimeTrapToken(TIME_TRAP_SECRET, Math.floor(Date.now() / 1000) - 2)
  }

  async function storedStatuses(table: string): Promise<string[]> {
    const rows = await harness.db.prepare(`SELECT status FROM ${table}`).all<{ status: string }>()
    return rows.results.map((row) => row.status)
  }

  async function publiclyListed(seed: string): Promise<string[]> {
    const response = await publishableClient.get(`/api/v1/public/${seed}`)
    return (await response.json<PublicList>()).data.map((entry) => entry.title)
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [blogSeed, noticesSeed, archiveSeed, vaultSeed],
      env: { PUBLIC_TIME_TRAP_SECRET: TIME_TRAP_SECRET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    await harness.db.prepare('DELETE FROM public_time_trap_tokens').run()
    anonymous = harness.anonymous()
    secretClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_SECRET_KEY })
    publishableClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLISHABLE_KEY })
  })

  describe('anonymous submission', () => {
    it('is stored as draft and stays out of the public list when the seed sets no defaultPublicStatus', async () => {
      const response = await anonymous.post('/api/v1/public/blog/add', { data: { title: 'Anon post' }, _timeTrapToken: await anonymousToken() })

      expect(response.status).toBe(201)
      expect(await storedStatuses('content_blog')).toEqual(['draft'])
      expect(await publiclyListed('blog')).toEqual([])
    })

    it('is stored as published when the owner sets defaultPublicStatus to published', async () => {
      const response = await anonymous.post('/api/v1/public/notices/add', { data: { title: 'Open notice' }, _timeTrapToken: await anonymousToken() })

      expect(response.status).toBe(201)
      expect(await storedStatuses('content_notices')).toEqual(['published'])
      expect(await publiclyListed('notices')).toEqual(['Open notice'])
    })

    it('gets 403 operation-not-allowed on a seed without allowPublicPost and nothing is written', async () => {
      const response = await anonymous.post('/api/v1/public/archive/add', { data: { title: 'Nope' }, _timeTrapToken: await anonymousToken() })

      expect(response.status).toBe(403)
      expect((await response.json<{ type: string }>()).type).toBe(`${PROBLEM_BASE}operation-not-allowed`)
      expect(await storedStatuses('content_archive')).toEqual([])
    })
  })

  describe('secret-key write', () => {
    it('creates an entry on a seed without allowPublicPost', async () => {
      const response = await secretClient.post('/api/v1/public/archive/add', { data: { title: 'From the SDK' } })

      expect(response.status).toBe(201)
      expect(await publiclyListed('archive')).toEqual(['From the SDK'])
    })

    it('publishes by default on a seed that opens no anonymous submissions', async () => {
      const response = await secretClient.post('/api/v1/public/archive/add', { data: { title: 'Trusted' } })

      expect(response.status).toBe(201)
      expect(await storedStatuses('content_archive')).toEqual(['published'])
    })

    it('still answers 404 seed-not-found on a seed with no public flag at all and writes nothing', async () => {
      const response = await secretClient.post('/api/v1/public/vault/add', { data: { title: 'Private' } })

      expect(response.status).toBe(404)
      expect((await response.json<{ type: string }>()).type).toBe(`${PROBLEM_BASE}seed-not-found`)
      expect(await storedStatuses('content_vault')).toEqual([])
    })

    it('honours an explicit status in the body', async () => {
      const response = await secretClient.post('/api/v1/public/blog/add', { data: { title: 'Held back' }, status: 'review' })

      expect(response.status).toBe(201)
      expect(await storedStatuses('content_blog')).toEqual(['review'])
    })
  })
})
