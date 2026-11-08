// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../../src/factory'
import { StaticContentRepository } from '../mocks/static-content.repository'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { seedTestUsers } from '../helpers/seed-fixtures'
import { TEST_SEEDS, TEST_USERS, TEST_ENV } from '../fixtures'

/**
 * FLOW: Activity trail
 *
 * Everything a person does that is worth remembering must land in `activity_logs` as an event that says what it
 * was: a trashed entry is not a purged one, a restore is not an edit, a publish is not a save. These tests drive
 * the real app and read the table back, so a handler that forgets to log fails here.
 */
describe('Flow: Activity trail', () => {
  let repository: StaticContentRepository
  let database: D1TestDatabase
  let application: ReturnType<typeof createBeechApp>
  let token: string
  const posts = TEST_SEEDS[0]

  interface TrailRow { action: string; entity_type: string; entity_id: string; entity_slug: string | null; user_email: string; details: Record<string, unknown> | null }

  async function trail(): Promise<TrailRow[]> {
    const { results } = await database
      .prepare('SELECT action, entity_type, entity_id, entity_slug, user_email, details FROM activity_logs ORDER BY rowid')
      .all<Omit<TrailRow, 'details'> & { details: string | null }>()
    return (results ?? []).map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null }))
  }

  /** The log is written after the response (waitUntil in production), so wait for the entry instead of racing it. */
  async function eventually(match: (rows: TrailRow[]) => TrailRow | undefined): Promise<TrailRow> {
    let found: TrailRow | undefined
    await vi.waitFor(async () => {
      found = match(await trail())
      expect(found).toBeDefined()
    })
    return found as TrailRow
  }

  const call = (method: string, path: string, body?: unknown) =>
    application.request(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, { ...TEST_ENV, DB: database })

  beforeEach(async () => {
    repository = new StaticContentRepository(TEST_SEEDS)
    database = new D1TestDatabase()
    await seedTestUsers(database, TEST_USERS)
    application = createBeechApp({ seeds: TEST_SEEDS, repository })

    const login = await application.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: database })
    token = (await login.json<{ token: string }>()).token
  })

  describe('content removal and restore', () => {
    it('trashing an entry is logged as a trash, not a delete', async () => {
      repository.load('posts', [{ id: 'p1', slug: 'first', status: 'published', title: 'First' }])

      expect((await call('DELETE', '/api/content/posts/p1')).status).toBe(200)

      const row = await eventually((rows) => rows.find((r) => r.action === 'trash'))
      expect(row).toMatchObject({ entity_type: 'content', entity_id: 'p1', entity_slug: 'posts', user_email: TEST_USERS[0].email })
      expect(row.details).toMatchObject({ title: 'First' })
    })

    it('purging an entry is logged as a purge', async () => {
      repository.load('posts', [{ id: 'p2', slug: 'second', status: 'published', title: 'Second' }])
      await call('DELETE', '/api/content/posts/p2') // only an entry already in the Trash can be purged

      expect((await call('DELETE', '/api/content/posts/p2?purge=true')).status).toBe(200)

      await eventually((rows) => rows.find((r) => r.action === 'purge' && r.entity_id === 'p2'))
    })

    it('restoring an entry is logged as a restore, not an update', async () => {
      repository.load('posts', [{ id: 'p3', slug: 'third', status: 'published', title: 'Third' }])
      await call('DELETE', '/api/content/posts/p3')

      expect((await call('POST', '/api/content/posts/p3/restore')).status).toBe(200)

      await eventually((rows) => rows.find((r) => r.action === 'restore' && r.entity_id === 'p3'))
      expect((await trail()).some((r) => r.action === 'update' && r.entity_id === 'p3')).toBe(false)
    })

    it('a bulk restore and a bulk purge are one line each, with how many', async () => {
      repository.load('posts', [
        { id: 'b1', slug: 'b-one', status: 'published', title: 'B1' },
        { id: 'b2', slug: 'b-two', status: 'published', title: 'B2' },
      ])
      await call('DELETE', '/api/content/posts/b1')
      await call('DELETE', '/api/content/posts/b2')

      expect((await call('POST', '/api/content/posts/trash/bulk-restore', { ids: ['b1', 'b2'] })).status).toBe(200)
      const restored = await eventually((rows) => rows.find((r) => r.action === 'restore' && r.details?.op === 'bulk'))
      expect(restored.details).toMatchObject({ op: 'bulk', count: 2 })

      await call('DELETE', '/api/content/posts/b1')
      await call('DELETE', '/api/content/posts/b2')
      expect((await call('POST', '/api/content/posts/trash/bulk-purge', { ids: ['b1', 'b2'] })).status).toBe(200)
      const purged = await eventually((rows) => rows.find((r) => r.action === 'purge' && r.details?.op === 'bulk'))
      expect(purged.details).toMatchObject({ op: 'bulk', count: 2 })
    })
  })

  describe('drafts', () => {
    it('saving stays an update with a note; publishing and discarding are their own events', async () => {
      repository.load('posts', [{ id: 'd1', slug: 'draft-me', status: 'published', title: 'Live' }])

      await call('PUT', '/api/content/posts/d1/draft', { title: 'Pending' })
      const saved = await eventually((rows) => rows.find((r) => r.action === 'update' && r.details?.note === 'draft saved'))
      expect(saved.entity_id).toBe('d1')

      expect((await call('POST', '/api/content/posts/d1/draft/publish')).status).toBe(200)
      await eventually((rows) => rows.find((r) => r.action === 'publish' && r.entity_id === 'd1'))

      await call('PUT', '/api/content/posts/d1/draft', { title: 'Second thoughts' })
      expect((await call('DELETE', '/api/content/posts/d1/draft')).status).toBe(200)
      await eventually((rows) => rows.find((r) => r.action === 'discard_draft' && r.entity_id === 'd1'))
    })
  })
})
