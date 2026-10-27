// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Draft slice — request contract, integration tier.
 * Covers what the draft routes refuse and in which order: the guard (seed, drafts allowed, live
 * entry) answers before the body of a PUT is read, then the body itself. Draft content rules
 * (privacy, localization, OCC, publish conflicts) live in the sibling draft-*.integration tests.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const PROBLEM = 'https://beechcms.dev/problems/'

const noDraftsSeed = defineSeed({
  slug: 'dc_no_drafts',
  label: 'No drafts',
  labelPlural: 'No drafts',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
})

const draftsSeed = defineSeed({
  slug: 'dc_drafts',
  label: 'Drafts',
  labelPlural: 'Drafts',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
})

interface ProblemBody {
  type: string
}

describe('draft slice — request contract (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [noDraftsSeed, draftsSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  async function createPost(slug: string): Promise<string> {
    const created = await admin.post('/api/content/dc_drafts', { title: 'Original', slug, status: 'published' })
    return (await created.json<{ id: string }>()).id
  }

  async function pendingDraftStatus(id: string): Promise<number> {
    return (await admin.get(`/api/content/dc_drafts/${id}/draft`)).status
  }

  describe('PUT /api/content/:slug/:id/draft', () => {
    it('an unknown seed answers 404 content-seed-not-found before the body is read', async () => {
      // Regression guard: draftGuard is a middleware ahead of zodJson. Swapped, a malformed body
      // would answer 400 here, ahead of the seed lookup.
      const response = await admin.put('/api/content/no-such-seed/some-id/draft', undefined, { body: '{not json' })

      expect(response.status).toBe(404)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}content-seed-not-found`)
    })

    it('a seed that does not allow drafts answers 405 draft-not-allowed before the body is read', async () => {
      const response = await admin.put('/api/content/dc_no_drafts/some-id/draft', undefined, { body: '{not json' })

      expect(response.status).toBe(405)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}draft-not-allowed`)
    })

    it('an entry that does not exist answers 404 content-not-found before the body is read', async () => {
      const response = await admin.put('/api/content/dc_drafts/no-such-entry/draft', undefined, { body: '{not json' })

      expect(response.status).toBe(404)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}content-not-found`)
    })

    it('a body that is not JSON is refused 400 content-invalid-json and no draft is stored', async () => {
      const id = await createPost('dc-malformed')

      const response = await admin.put(`/api/content/dc_drafts/${id}/draft`, undefined, { body: '{not json' })

      expect(response.status).toBe(400)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}content-invalid-json`)
      expect(await pendingDraftStatus(id)).toBe(404)
    })

    it.each([[null], [[]], [5]])(
      'a body of %j is read as an empty draft, refused 400 content-validation-failed, and no draft is stored',
      async (payload) => {
        const id = await createPost('dc-not-an-object')

        const response = await admin.put(`/api/content/dc_drafts/${id}/draft`, payload)

        expect(response.status).toBe(400)
        const body = await response.json<ProblemBody>()
        expect(body.type).toBe(`${PROBLEM}content-validation-failed`)
        expect(await pendingDraftStatus(id)).toBe(404)
      },
    )
  })

  describe('the other draft routes on a seed that does not allow drafts', () => {
    it.each([
      ['GET', '/api/content/dc_no_drafts/some-id/draft'],
      ['POST', '/api/content/dc_no_drafts/some-id/draft/publish'],
      ['DELETE', '/api/content/dc_no_drafts/some-id/draft'],
    ])('%s %s answers 405 draft-not-allowed', async (method, path) => {
      const response = await admin.request(path, { method })

      expect(response.status).toBe(405)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM}draft-not-allowed`)
    })
  })
})
