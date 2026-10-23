// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — Time-Trap signing key integration tier. The anti-bot token is only as strong as its HMAC key,
 * so a deployment without PUBLIC_TIME_TRAP_SECRET must fail closed instead of signing with a key that ships in the repo.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, generateTimeTrapToken } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const publicFormSeed = defineSeed({
  slug: 'public_form',
  label: 'Public Form',
  displayNameAlias: 'title',
  allowPublicPost: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
  ],
})

// The literal the code used to fall back to; it is public knowledge, so a token signed with it proves nothing.
const REPO_PUBLISHED_SECRET = 'beech-public-timetrap-default-secret'
const OPERATOR_SECRET = 'operator-configured-time-trap-secret-0123456789'

describe('public slice — Time-Trap signing key (real D1)', () => {
  let harness: TestHarness
  let anonymous: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [publicFormSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    await harness.db.prepare('DELETE FROM public_time_trap_tokens').run()
    anonymous = harness.anonymous()
  })

  describe('GET /api/v1/public/timetrap/token', () => {
    it('answers 503 and issues no token while PUBLIC_TIME_TRAP_SECRET is unset', async () => {
      const response = await anonymous.get('/api/v1/public/timetrap/token')

      expect(response.status).toBe(503)
      const body = await response.json<{ token?: string; type: string }>()
      expect(body.token).toBeUndefined()
      expect(body.type).toContain('time-trap-not-configured')
    })

    it('issues a token verifiable only with the operator secret once it is configured', async () => {
      harness.env.PUBLIC_TIME_TRAP_SECRET = OPERATOR_SECRET

      const response = await anonymous.get('/api/v1/public/timetrap/token')

      expect(response.status).toBe(200)
      const body = await response.json<{ token: string }>()
      expect(body.token).toMatch(/^t0_\d+\.[0-9a-f]{64}$/)
    })
  })

  describe('POST /api/v1/public/:seed/add', () => {
    it('answers 503 and persists nothing for a token forged with the repo-published key while the secret is unset', async () => {
      const forged = await generateTimeTrapToken(REPO_PUBLISHED_SECRET, Math.floor(Date.now() / 1000) - 2)

      const response = await anonymous.post('/api/v1/public/public_form/add', { data: { title: 'Bot' }, _timeTrapToken: forged })

      expect(response.status).toBe(503)
      const rows = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_public_form').first<{ n: number }>()
      expect(rows?.n).toBe(0)
      const claimed = await harness.db.prepare('SELECT COUNT(*) AS n FROM public_time_trap_tokens').first<{ n: number }>()
      expect(claimed?.n).toBe(0)
    })

    it('rejects a token forged with the repo-published key with 422 when the operator secret is configured', async () => {
      harness.env.PUBLIC_TIME_TRAP_SECRET = OPERATOR_SECRET
      const forged = await generateTimeTrapToken(REPO_PUBLISHED_SECRET, Math.floor(Date.now() / 1000) - 2)

      const response = await anonymous.post('/api/v1/public/public_form/add', { data: { title: 'Bot' }, _timeTrapToken: forged })

      expect(response.status).toBe(422)
      const rows = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_public_form').first<{ n: number }>()
      expect(rows?.n).toBe(0)
    })
  })
})
