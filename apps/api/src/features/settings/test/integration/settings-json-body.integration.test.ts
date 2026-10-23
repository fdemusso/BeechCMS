// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Settings slice — JSON body shape integration tier. Covers the five PUT routes that read fields
 * off a parsed body: a valid JSON value that is not an object must be a client error, never a 500.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const BODY_ROUTES = [
  { path: '/api/settings', user: 'admin' },
  { path: '/api/settings/profile', user: 'editor' },
  { path: '/api/settings/password', user: 'editor' },
  { path: '/api/settings/avatar', user: 'editor' },
  { path: '/api/settings/notifications', user: 'editor' },
] as const

// `null` and arrays are valid JSON, so they pass the parse step and reach the field access.
// Each case is wrapped because `it.each` spreads an array row into separate arguments.
const NON_OBJECT_BODIES: ReadonlyArray<readonly [unknown]> = [[null], [[]]]

describe('settings slice — JSON body shape (real D1)', () => {
  let harness: TestHarness

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
  })

  describe.each(BODY_ROUTES)('PUT $path', ({ path, user }) => {
    it.each(NON_OBJECT_BODIES)('a non-object JSON body (%j) is rejected with 400', async (body) => {
      const client = await harness.asUser(user)

      const response = await client.put(path, body)

      expect(response.status).toBe(400)
    })
  })
})
