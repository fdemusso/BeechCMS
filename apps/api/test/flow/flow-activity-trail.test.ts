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

  describe('signing in and out', () => {
    const origin = { 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'IT', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' }

    const signIn = (password: string, email = TEST_USERS[0].email) =>
      application.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...origin },
        body: JSON.stringify({ email, password }),
      }, { ...TEST_ENV, DB: database })

    it('a successful sign-in records where it came from', async () => {
      expect((await signIn('password123')).status).toBe(200)

      const row = await eventually((rows) => rows.find((r) => r.action === 'login' && r.details?.ip === '203.0.113.7'))
      expect(row).toMatchObject({ entity_type: 'auth', user_email: TEST_USERS[0].email })
      expect(row.details).toMatchObject({ ip: '203.0.113.7', country: 'IT', userAgent: expect.stringContaining('Chrome') })
    })

    it('a wrong password is recorded against the real account, with the reason', async () => {
      expect((await signIn('not-the-password')).status).toBe(401)

      const row = await eventually((rows) => rows.find((r) => r.action === 'login_failed'))
      expect(row).toMatchObject({ entity_type: 'auth', user_email: TEST_USERS[0].email })
      expect(row.details).toMatchObject({ reason: 'wrong-password', ip: '203.0.113.7' })
    })

    it('an address nobody owns leaves nothing behind', async () => {
      expect((await signIn('whatever', 'nobody@example.com')).status).toBe(401)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect((await trail()).some((r) => r.action === 'login_failed')).toBe(false)
    })

    it('signing out is recorded for the person who signed out', async () => {
      const res = await signIn('password123')
      const refresh = res.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1] ?? ''

      const out = await application.request('/auth/logout', { method: 'POST', headers: { Cookie: `refresh_token=${refresh}`, ...origin } }, { ...TEST_ENV, DB: database })
      expect(out.status).toBe(200)

      const row = await eventually((rows) => rows.find((r) => r.action === 'logout'))
      expect(row).toMatchObject({ entity_type: 'auth', user_email: TEST_USERS[0].email })
    })
  })

  describe('account and site settings', () => {
    it('profile, password, avatar and notification changes say what changed, never the values', async () => {
      expect((await call('PUT', '/api/settings/profile', { name: 'Ada' })).status).toBe(200)
      const profile = await eventually((rows) => rows.find((r) => r.details?.op === 'profile'))
      expect(profile).toMatchObject({ action: 'update', entity_type: 'user' })
      expect(profile.details).toMatchObject({ fields: ['name'] })

      expect((await call('PUT', '/api/settings/password', { currentPassword: 'password123', newPassword: 'a-brand-new-Passw0rd!' })).status).toBe(200)
      const password = await eventually((rows) => rows.find((r) => r.details?.op === 'password'))
      expect(JSON.stringify(password.details)).not.toContain('Passw0rd')
      expect(password.details).toMatchObject({ sessionsRevoked: true })

      expect((await call('PUT', '/api/settings/avatar', { avatarUrl: null })).status).toBe(200)
      await eventually((rows) => rows.find((r) => r.details?.op === 'avatar-removed'))

      expect((await call('PUT', '/api/settings/notifications', { contentCreate: true, contentUpdate: false, contentDelete: false, mediaUpload: false })).status).toBe(200)
      await eventually((rows) => rows.find((r) => r.details?.op === 'notifications'))
    })

    it('a site settings change lists the fields it touched', async () => {
      expect((await call('PUT', '/api/settings', { timezone: 'Europe/Rome' })).status).toBe(200)

      const row = await eventually((rows) => rows.find((r) => r.entity_type === 'settings'))
      expect(row).toMatchObject({ action: 'update', entity_id: 'site' })
      expect(row.details).toMatchObject({ op: 'site', fields: ['timezone'] })
    })

    it('revoking a session is logged as a revoke on that session', async () => {
      const sessions = await (await call('GET', '/api/settings/sessions')).json<Array<{ id: string }>>()
      expect(sessions.length).toBeGreaterThan(0)

      expect((await call('DELETE', `/api/settings/sessions/${sessions[0].id}`)).status).toBe(200)

      const row = await eventually((rows) => rows.find((r) => r.action === 'revoke'))
      expect(row).toMatchObject({ entity_type: 'session', entity_id: sessions[0].id })
    })
  })

  describe('people, roles and access', () => {
    it('creating and deactivating an account name the account, never the password', async () => {
      const created = await call('POST', '/api/rbac/users', { email: 'new.hire@example.com', password: 'a-long-enough-pass' })
      expect(created.status).toBe(201)
      const { id } = await created.json<{ id: string }>()

      const row = await eventually((rows) => rows.find((r) => r.entity_type === 'user' && r.details?.op === 'create'))
      expect(row).toMatchObject({ action: 'create', entity_id: id })
      expect(row.details).toMatchObject({ email: 'new.hire@example.com' })
      expect(JSON.stringify(row.details)).not.toContain('a-long-enough-pass')

      expect((await call('PATCH', `/api/rbac/users/${id}/active`, { isActive: false })).status).toBe(200)
      const off = await eventually((rows) => rows.find((r) => r.details?.op === 'deactivate'))
      expect(off).toMatchObject({ action: 'update', entity_type: 'user', entity_id: id })
    })

    it('roles, assignments and invitations each leave a line naming what they touched', async () => {
      const role = await call('POST', '/api/rbac/roles', { name: 'Reviewer', permissions: ['content:read'] })
      expect(role.status).toBe(201)
      const { id: roleId } = await role.json<{ id: string }>()
      await eventually((rows) => rows.find((r) => r.entity_type === 'role' && r.action === 'create' && r.details?.name === 'Reviewer'))

      expect((await call('PUT', `/api/rbac/roles/${roleId}`, { name: 'Reviewer+', permissions: ['content:read', 'content:update'] })).status).toBe(200)
      await eventually((rows) => rows.find((r) => r.entity_type === 'role' && r.action === 'update' && r.details?.name === 'Reviewer+'))

      const account = await (await call('POST', '/api/rbac/users', { email: 'reviewer@example.com', password: 'a-long-enough-pass' })).json<{ id: string }>()
      const assignment = await call('POST', '/api/rbac/assignments', { userId: account.id, roleId, scope: '*' })
      expect(assignment.status).toBe(201)
      const { id: assignmentId } = await assignment.json<{ id: string }>()
      const assigned = await eventually((rows) => rows.find((r) => r.entity_type === 'assignment' && r.action === 'create'))
      expect(assigned.details).toMatchObject({ email: 'reviewer@example.com', role: 'Reviewer+', scope: '*' })

      expect((await call('DELETE', `/api/rbac/assignments/${assignmentId}`)).status).toBe(204)
      const unassigned = await eventually((rows) => rows.find((r) => r.entity_type === 'assignment' && r.action === 'delete'))
      expect(unassigned.details).toMatchObject({ email: 'reviewer@example.com', role: 'Reviewer+' })

      const invite = await call('POST', '/api/rbac/invitations', { email: 'invitee@example.com', roleId, scope: '*' })
      expect(invite.status).toBe(201)
      const { id: invitationId } = await invite.json<{ id: string }>()
      await eventually((rows) => rows.find((r) => r.entity_type === 'invitation' && r.action === 'create' && r.details?.email === 'invitee@example.com'))

      expect((await call('DELETE', `/api/rbac/invitations/${invitationId}`)).status).toBe(204)
      await eventually((rows) => rows.find((r) => r.entity_type === 'invitation' && r.action === 'revoke'))

      expect((await call('DELETE', `/api/rbac/roles/${roleId}`)).status).toBe(204)
      await eventually((rows) => rows.find((r) => r.entity_type === 'role' && r.action === 'delete' && r.details?.name === 'Reviewer+'))
    })
  })

  describe('automations', () => {
    it('creating, disabling and deleting an automation are logged by name', async () => {
      const created = await call('POST', '/api/automations', {
        seed_slug: 'posts', name: 'notify-on-create', triggers: [{ event: 'create' }],
        actions: [{ type: 'webhook', url: 'https://example.com/hook', body_template: '{}' }],
      })
      expect(created.status).toBe(201)
      const { id } = await created.json<{ id: string }>()
      await eventually((rows) => rows.find((r) => r.entity_type === 'automation' && r.action === 'create'))

      expect((await call('PATCH', `/api/automations/${id}/toggle`, { enabled: false })).status).toBe(204)
      const off = await eventually((rows) => rows.find((r) => r.entity_type === 'automation' && r.details?.op === 'disable'))
      expect(off).toMatchObject({ entity_id: id, entity_slug: 'posts' })
      expect(off.details).toMatchObject({ name: 'notify-on-create' })

      expect((await call('DELETE', `/api/automations/${id}`)).status).toBe(204)
      await eventually((rows) => rows.find((r) => r.entity_type === 'automation' && r.action === 'delete'))
    })
  })

  describe('who sees what', () => {
    it('the dashboard feed shows work on content, never sign-ins or account changes', async () => {
      repository.load('posts', [{ id: 'v1', slug: 'visible', status: 'published', title: 'Visible' }])
      await call('DELETE', '/api/content/posts/v1')
      await call('PUT', '/api/settings/profile', { name: 'Ada' })
      await eventually((rows) => rows.find((r) => r.details?.op === 'profile'))
      await eventually((rows) => rows.find((r) => r.action === 'trash'))

      const feedResponse = await call('GET', '/api/content/stats/recent-activity')
      expect(feedResponse.status, await feedResponse.clone().text()).toBe(200)
      const feed = await feedResponse.json<Array<{ action: string; entity_type: string }>>()

      expect(feed.some((row) => row.action === 'trash')).toBe(true)
      expect(feed.some((row) => ['auth', 'user', 'session', 'settings'].includes(row.entity_type))).toBe(false)
    })

    it('your own history never contains somebody else, whoever else signs in', async () => {
      const other = TEST_USERS[1]
      const otherLogin = await application.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.9' },
        body: JSON.stringify({ email: other.email, password: 'password123' }),
      }, { ...TEST_ENV, DB: database })
      expect(otherLogin.status).toBe(200)
      await eventually((rows) => rows.find((r) => r.user_email === other.email && r.action === 'login'))

      const mine = await (await call('GET', '/api/settings/activity')).json<Array<{ details: string | null }>>()

      expect(mine.length).toBeGreaterThan(0)
      expect(JSON.stringify(mine)).not.toContain('198.51.100.9')
    })
  })
})
