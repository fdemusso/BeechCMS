// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — Idempotency-Key replay integration tier. Covers POST .../add retries against real D1:
 * the request fingerprint must identify the payload by meaning, not by the member order of JSON objects.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, TEST_PUBLIC_WRITE_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const publicJsonSeed = defineSeed({
  slug: 'public_json',
  label: 'Public Json',
  displayNameAlias: 'title',
  allowPublicPost: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
    { id: 'br_02', alias: 'settings', label: 'Settings', type: 'json', policies: { public: true } },
  ],
})

describe('public slice — idempotent add (real D1)', () => {
  let harness: TestHarness
  let publicClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [publicJsonSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    publicClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLIC_WRITE_KEY })
  })

  describe('POST /api/v1/public/:seed/add', () => {
    it('replays the cached 201 when a retry reorders the members of a JSON object', async () => {
      const headers = { 'Idempotency-Key': 'reordered-json-retry' }
      const first = await publicClient.post('/api/v1/public/public_json/add', { title: 'Prefs', settings: { a: 1, nested: { x: true, y: [1, 2] } } }, { headers })
      expect(first.status).toBe(201) // precondition
      const { id } = await first.json<{ id: string }>()

      // Regression guard: the fingerprint hashed insertion-ordered JSON, so this equivalent retry got a 409.
      const response = await publicClient.post('/api/v1/public/public_json/add', { settings: { nested: { y: [1, 2], x: true }, a: 1 }, title: 'Prefs' }, { headers })

      expect(response.status).toBe(201)
      const body = await response.json<{ id: string }>()
      expect(body.id).toBe(id)
      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_public_json').first<{ n: number }>()
      expect(row?.n).toBe(1)
    })

    it('answers 409 idempotency-key-conflict when a retry changes a nested JSON value', async () => {
      const headers = { 'Idempotency-Key': 'changed-json-retry' }
      const first = await publicClient.post('/api/v1/public/public_json/add', { title: 'Prefs', settings: { a: 1, nested: { y: [1, 2] } } }, { headers })
      expect(first.status).toBe(201) // precondition

      // Array order is data, so a reordered array is a different request.
      const response = await publicClient.post('/api/v1/public/public_json/add', { title: 'Prefs', settings: { a: 1, nested: { y: [2, 1] } } }, { headers })

      expect(response.status).toBe(409)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/idempotency-key-conflict')
      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_public_json').first<{ n: number }>()
      expect(row?.n).toBe(1)
    })
  })
})
