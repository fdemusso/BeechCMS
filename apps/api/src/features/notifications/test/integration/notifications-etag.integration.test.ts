// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Notifications slice — ETag negotiation integration tier.
 * Covers GET /api/content/notifications against real D1: a conditional request must answer 304 only
 * while the inbox content is unchanged, including mutations that leave count, newest timestamp and
 * read total identical.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('notifications slice — ETag integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await harness.db.prepare('DELETE FROM notifications').run()
  })

  // created_at is pinned: unixepoch() has one-second resolution, so two writers collide on it.
  async function insertNotification(id: string, isRead: 0 | 1, createdAt = 100): Promise<void> {
    await harness.db
      .prepare('INSERT INTO notifications (id, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, `title-${id}`, `message-${id}`, isRead, createdAt)
      .run()
  }

  async function currentEtag(): Promise<string> {
    const response = await admin.get('/api/content/notifications')
    return response.headers.get('ETag') ?? ''
  }

  describe('GET /api/content/notifications', () => {
    it('answers 304 when the inbox is unchanged since the ETag was issued', async () => {
      await insertNotification('a', 1)
      await insertNotification('b', 0)
      const etag = await currentEtag()

      const response = await admin.get('/api/content/notifications', { headers: { 'If-None-Match': etag } })

      expect(response.status).toBe(304)
    })

    it('answers 200 with the new read state when two notifications swap read and unread', async () => {
      await insertNotification('a', 1)
      await insertNotification('b', 0)
      const staleEtag = await currentEtag()
      await admin.patch('/api/content/notifications/a/unread')
      await admin.patch('/api/content/notifications/b/read')

      const response = await admin.get('/api/content/notifications', { headers: { 'If-None-Match': staleEtag } })

      expect(response.status).toBe(200)
      expect(response.headers.get('ETag')).not.toBe(staleEtag)
      const body = await response.json<{ id: string; isRead: boolean }[]>()
      expect(Object.fromEntries(body.map((item) => [item.id, item.isRead]))).toEqual({ a: false, b: true })
    })

    it('answers 200 with the new notification when one is deleted and another created in the same second', async () => {
      await insertNotification('x', 0)
      const staleEtag = await currentEtag()
      await admin.delete('/api/content/notifications/x')
      await insertNotification('y', 0)

      const response = await admin.get('/api/content/notifications', { headers: { 'If-None-Match': staleEtag } })

      expect(response.status).toBe(200)
      const body = await response.json<{ id: string }[]>()
      expect(body.map((item) => item.id)).toEqual(['y'])
    })

    // RFC 9110 §13.1.2: If-None-Match is a list of entity-tags or `*`, compared weakly. An exact-string
    // compare turns every one of these into a silent full response.
    it.each([
      ['a list that contains the current tag', (etag: string) => `"other", ${etag}`],
      ['a wildcard', () => '*'],
      ['the strong form of the weak tag', (etag: string) => etag.replace(/^W\//, '')],
    ])('answers 304 when If-None-Match is %s', async (_label, buildHeader) => {
      await insertNotification('a', 0)
      const etag = await currentEtag()

      const response = await admin.get('/api/content/notifications', {
        headers: { 'If-None-Match': buildHeader(etag) },
      })

      expect(response.status).toBe(304)
    })

    it('answers 200 when If-None-Match lists only tags that do not match', async () => {
      await insertNotification('a', 0)

      const response = await admin.get('/api/content/notifications', {
        headers: { 'If-None-Match': 'W/"stale-one", "stale-two"' },
      })

      expect(response.status).toBe(200)
    })

    it('sends ETag and Cache-Control on the 304 so caches keep the same freshness rules', async () => {
      await insertNotification('a', 0)
      const etag = await currentEtag()

      const response = await admin.get('/api/content/notifications', { headers: { 'If-None-Match': etag } })

      expect(response.status).toBe(304)
      expect(response.headers.get('ETag')).toBe(etag)
      expect(response.headers.get('Cache-Control')).toBe('no-cache, must-revalidate')
    })
  })
})
