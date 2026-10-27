// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Stats slice — recent activity feed, integration tier.
 * Covers the optional `slug` scope of GET /api/content/stats/recent-activity against real D1.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface ActivityItem {
  id: string
  entity_slug: string | null
  details: unknown
}

const ENDPOINT = '/api/content/stats/recent-activity'

describe('stats slice — recent activity (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  async function logActivity(id: string, entitySlug: string, createdAt: number): Promise<void> {
    await harness.db
      .prepare(
        `INSERT INTO activity_logs (id, user_id, user_email, action, entity_type, entity_id, entity_slug, details, created_at)
         VALUES (?, ?, ?, 'create', 'content', ?, ?, ?, ?)`,
      )
      .bind(id, CANONICAL_USERS.admin.id, CANONICAL_USERS.admin.email, `entry-${id}`, entitySlug, JSON.stringify({ title: id }), createdAt)
      .run()
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await harness.db.prepare('DELETE FROM activity_logs').run()
    await logActivity('a1', 'posts', 100)
    await logActivity('b1', 'pages', 200)
    await logActivity('a2', 'posts', 300)
  })

  describe(`GET ${ENDPOINT}`, () => {
    it('lists the newest activity of every seed when no slug is given', async () => {
      const response = await admin.get(ENDPOINT)

      expect(response.status).toBe(200)
      const body = await response.json<ActivityItem[]>()
      expect(body.map(item => item.id)).toEqual(['a2', 'b1', 'a1'])
    })

    it('scopes the feed to one seed when a slug is given', async () => {
      const response = await admin.get(`${ENDPOINT}?slug=posts`)

      const body = await response.json<ActivityItem[]>()
      expect(body.map(item => item.id)).toEqual(['a2', 'a1'])
    })

    it('trims the slug, so a padded value still scopes the feed', async () => {
      const response = await admin.get(`${ENDPOINT}?slug=%20pages%20`)

      const body = await response.json<ActivityItem[]>()
      expect(body.map(item => item.id)).toEqual(['b1'])
    })

    it('returns an empty feed for a slug no activity belongs to', async () => {
      const response = await admin.get(`${ENDPOINT}?slug=unknown`)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual([])
    })

    it('ignores a blank slug and serves the unscoped feed', async () => {
      const response = await admin.get(`${ENDPOINT}?slug=%20`)

      const body = await response.json<ActivityItem[]>()
      expect(body).toHaveLength(3)
    })

    it('tells caches never to keep the feed, so a mutation shows up on the next poll', async () => {
      const response = await admin.get(ENDPOINT)

      expect(response.headers.get('Cache-Control')).toBe('no-store')
    })
  })
})
