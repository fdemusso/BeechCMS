// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Notifications slice — mutation routes integration tier.
 * Covers mark read / mark unread / delete against real D1: an id that matches no row must answer 404
 * and leave the inbox untouched, while an existing id keeps answering 200 and persists the change.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('notifications slice — mutations integration (real D1)', () => {
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

  async function insertNotification(id: string, isRead: 0 | 1): Promise<void> {
    await harness.db
      .prepare('INSERT INTO notifications (id, title, message, is_read) VALUES (?, ?, ?, ?)')
      .bind(id, `title-${id}`, `message-${id}`, isRead)
      .run()
  }

  async function readFlag(id: string): Promise<number | undefined> {
    const row = await harness.db
      .prepare('SELECT is_read FROM notifications WHERE id = ?')
      .bind(id)
      .first<{ is_read: number }>()
    return row?.is_read
  }

  async function countRows(): Promise<number> {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM notifications').first<{ n: number }>()
    return row?.n ?? -1
  }

  describe('PATCH /api/content/notifications/:id/read', () => {
    it('answers 404 for an id that matches no notification and leaves every row unchanged', async () => {
      await insertNotification('known', 0)

      const response = await admin.patch('/api/content/notifications/missing/read')

      expect(response.status).toBe(404)
      expect(await readFlag('known')).toBe(0)
    })

    it('answers 200 and persists the read flag for an existing notification', async () => {
      await insertNotification('known', 0)

      const response = await admin.patch('/api/content/notifications/known/read')

      expect(response.status).toBe(200)
      expect(await readFlag('known')).toBe(1)
    })

    it('answers 200 when the notification is already read', async () => {
      await insertNotification('known', 1)

      const response = await admin.patch('/api/content/notifications/known/read')

      expect(response.status).toBe(200)
      expect(await readFlag('known')).toBe(1)
    })
  })

  describe('PATCH /api/content/notifications/:id/unread', () => {
    it('answers 404 for an id that matches no notification and leaves every row unchanged', async () => {
      await insertNotification('known', 1)

      const response = await admin.patch('/api/content/notifications/missing/unread')

      expect(response.status).toBe(404)
      expect(await readFlag('known')).toBe(1)
    })

    it('answers 200 and persists the unread flag for an existing notification', async () => {
      await insertNotification('known', 1)

      const response = await admin.patch('/api/content/notifications/known/unread')

      expect(response.status).toBe(200)
      expect(await readFlag('known')).toBe(0)
    })
  })

  describe('DELETE /api/content/notifications/:id', () => {
    it('answers 404 for an id that matches no notification and keeps every row', async () => {
      await insertNotification('known', 0)

      const response = await admin.delete('/api/content/notifications/missing')

      expect(response.status).toBe(404)
      expect(await countRows()).toBe(1)
    })

    it('answers 200 and removes the row for an existing notification', async () => {
      await insertNotification('known', 0)

      const response = await admin.delete('/api/content/notifications/known')

      expect(response.status).toBe(200)
      expect(await countRows()).toBe(0)
    })

    it('answers 404 when the same notification is deleted twice', async () => {
      await insertNotification('known', 0)
      await admin.delete('/api/content/notifications/known')

      const response = await admin.delete('/api/content/notifications/known')

      expect(response.status).toBe(404)
    })
  })
})
