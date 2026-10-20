// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — integration tier. An unexpected repository failure must never put the
 * internal exception message in the response body unless the environment is explicitly a
 * local one. Covers read and edit, with ENV omitted, unrecognised and `production`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, TEST_PUBLIC_READ_KEY, TEST_PUBLIC_WRITE_KEY, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const redactSeed = defineSeed({
  slug: 'redact_probe',
  label: 'Redact Probe',
  displayNameAlias: 'title',
  allowPublicRead: true,
  allowPublicEdit: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
  ],
})

const GENERIC = 'An unexpected error occurred.'
const ENTRY_ID = '11111111-1111-4111-8111-111111111111'

interface ProblemBody {
  status: number
  detail: string
}

async function bootWithBrokenTable(envOverride: Record<string, unknown>): Promise<TestHarness> {
  __resetSeedRegistryCache()
  const harness = await createTestHarness({
    db: env.DB,
    seeds: [redactSeed],
    env: envOverride,
    createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
  })
  // Registry stays intact, so the request reaches the repository and the D1 query throws.
  await harness.db.prepare('DROP TABLE content_redact_probe').run()
  return harness
}

describe('public slice — internal error redaction (real D1)', () => {
  let harness: TestHarness

  afterEach(async () => {
    // Leave no half-broken table behind: the next harness boot re-provisions it from scratch.
    await harness.db.prepare('DROP TABLE IF EXISTS content_redact_probe').run()
  })

  describe.each([
    ['ENV omitted', { ENV: undefined }],
    ['ENV unrecognised', { ENV: 'staging' }],
    ['ENV production', { ENV: 'production' }],
  ])('%s', (_label, envOverride) => {
    beforeEach(async () => {
      harness = await bootWithBrokenTable(envOverride)
    })

    it('GET /api/v1/public/:seed answers 500 with the generic detail', async () => {
      const response = await harness.anonymous().get('/api/v1/public/redact_probe', {
        headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
      })

      expect(response.status).toBe(500)
      const body = await response.json<ProblemBody>()
      expect(body.detail).toBe(GENERIC)
    })

    it('PUT /api/v1/public/:seed/edit/:id answers 500 with the generic detail', async () => {
      const response = await harness
        .anonymous()
        .withHeaders({ 'X-API-Key': TEST_PUBLIC_WRITE_KEY })
        .put(`/api/v1/public/redact_probe/edit/${ENTRY_ID}`, { title: 'New' })

      expect(response.status).toBe(500)
      const body = await response.json<ProblemBody>()
      expect(body.detail).toBe(GENERIC)
    })
  })
})
