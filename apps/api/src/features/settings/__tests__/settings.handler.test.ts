// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { settingsApp } from '../settings.handler'

// ---------------------------------------------------------------------------
// Helpers and Mocks
// ---------------------------------------------------------------------------

function buildApp(mocks: any = {}) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('siteSettingsRepository', mocks.siteSettingsRepository ?? {
      getAll: vi.fn().mockResolvedValue({
        siteTitle: 'Beech CMS',
        defaultLanguage: 'en',
        timezone: 'Europe/Rome',
        currency: 'EUR',
        companyName: 'Flavio Corp',
        companyWebsite: 'https://flavio.corp',
        companyAbbreviation: 'FC',
      }),
      setMany: vi.fn().mockResolvedValue(undefined),
    })

    c.set('userRepository', mocks.userRepository ?? {
      findById: vi.fn().mockResolvedValue({
        id: 'u1',
        email: 'test@beechcms.com',
        name: 'Test',
        surname: 'User',
        passwordHash: 'hashed-pwd',
        avatarUrl: null,
        notificationPreferences: JSON.stringify({
          contentCreate: true,
          contentUpdate: false,
          contentDelete: true,
          mediaUpload: true,
        }),
      }),
      emailBelongsToAnotherUser: vi.fn().mockResolvedValue(false),
      updateProfile: vi.fn().mockResolvedValue(undefined),
      updatePasswordHash: vi.fn().mockResolvedValue(undefined),
      updateAvatarUrl: vi.fn().mockResolvedValue(undefined),
      updateNotificationPreferences: vi.fn().mockResolvedValue(undefined),
    })

    c.set('sessionRepository', mocks.sessionRepository ?? {
      listActiveForUser: vi.fn().mockResolvedValue([
        { id: 'sess-1', userAgent: 'Mozilla/5.0', expiresAt: 2000000000 },
      ]),
      revokeById: vi.fn().mockResolvedValue(true),
    })

    c.set('activityLogRepository', mocks.activityLogRepository ?? {
      list: vi.fn().mockResolvedValue([
        {
          id: 'log-1',
          action: 'create',
          entityType: 'post',
          entitySlug: 'first-post',
          details: { ip: '127.0.0.1' },
          createdAt: 1700000000,
        },
      ]),
    })

    c.set('mediaRepository', mocks.mediaRepository ?? {
      count: vi.fn().mockResolvedValue(5),
      list: vi.fn().mockResolvedValue({
        items: [
          { key: 'media/img1.png', size: 1024 },
          { key: 'media/img2.png', size: 2048 },
        ],
      }),
    })

    c.set('systemStatsRepository', mocks.systemStatsRepository ?? {
      getStorageUsage: vi.fn().mockResolvedValue(3072),
    })

    c.set('seedRegistry', mocks.seedRegistry ?? {
      all: vi.fn().mockReturnValue([{ slug: 'posts' }]),
    })

    c.set('contentScanRepository', mocks.contentScanRepository ?? {
      getReferencedMediaKeys: vi.fn().mockResolvedValue(new Set(['media/img1.png'])),
    })

    c.set('hashProvider', mocks.hashProvider ?? {
      verify: vi.fn().mockResolvedValue(true),
      hash: vi.fn().mockResolvedValue('new-hashed-pwd'),
    })

    c.set('jwtPayload', mocks.jwtPayload ?? { sub: 'u1' })

    c.env = mocks.env ?? {
      DATE_FORMAT: 'YYYY-MM-DD',
      EMAIL_PROVIDER: 'smtp',
    }

    await next()
  })

  app.route('/', settingsApp)
  return app
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Settings Handler', () => {
  describe('GET /', () => {
    it('returns site settings configuration', async () => {
      const app = buildApp()
      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json() as any
      expect(body.siteTitle).toBe('Beech CMS')
      expect(body.company.name).toBe('Flavio Corp')
      expect(body.dateFormat).toBe('YYYY-MM-DD')
      expect(body.features.email).toBe(true)
    })
  })

  describe('PUT /', () => {
    it('returns 400 for invalid JSON', async () => {
      const app = buildApp()
      const res = await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      expect(res.status).toBe(400)
      const body = await res.json() as any
      expect(body.error).toBe('Invalid JSON body')
    })

    it('returns 400 for invalid default language', async () => {
      const app = buildApp()
      const res = await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultLanguage: 'fr' }),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as any
      expect(body.detail).toContain('Invalid default language')
    })

    it('returns 400 for invalid company website URL', async () => {
      const app = buildApp()
      const res = await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: { website: 'not-a-valid-url' } }),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as any
      expect(body.detail).toContain('Invalid company website URL')
    })

    it('updates site settings and syncs company name to siteTitle if siteTitle is omitted', async () => {
      const setManySpy = vi.fn().mockResolvedValue(undefined)
      const app = buildApp({
        siteSettingsRepository: {
          getAll: vi.fn(),
          setMany: setManySpy,
        },
      })

      const res = await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultLanguage: 'it',
          company: {
            name: 'New Corp',
            website: 'https://newcorp.com',
            abbreviation: 'NC',
          },
        }),
      })

      expect(res.status).toBe(200)
      expect(setManySpy).toHaveBeenCalledWith({
        defaultLanguage: 'it',
        companyName: 'New Corp',
        companyWebsite: 'https://newcorp.com',
        companyAbbreviation: 'NC',
        siteTitle: 'New Corp',
      })
    })

    it('allows resetting company fields by passing null', async () => {
      const setManySpy = vi.fn().mockResolvedValue(undefined)
      const app = buildApp({
        siteSettingsRepository: {
          getAll: vi.fn(),
          setMany: setManySpy,
        },
      })

      const res = await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: null,
        }),
      })

      expect(res.status).toBe(200)
      expect(setManySpy).toHaveBeenCalledWith({
        companyName: null,
        companyWebsite: null,
        companyAbbreviation: null,
      })
    })
  })

  describe('GET /me', () => {
    it('returns 404 if current user is not found', async () => {
      const app = buildApp({
        userRepository: {
          findById: vi.fn().mockResolvedValue(null),
        },
      })
      const res = await app.request('/me')
      expect(res.status).toBe(404)
      const body = await res.json() as any
      expect(body.error).toBe('User not found')
    })

    it('returns current user profile and notification preferences', async () => {
      const app = buildApp()
      const res = await app.request('/me')
      expect(res.status).toBe(200)
      const body = await res.json() as any
      expect(body.email).toBe('test@beechcms.com')
      expect(body.surname).toBe('User')
      expect(body.avatarUrl).toContain('gravatar.com')
      expect(body.notificationPrefs.contentUpdate).toBe(false)
    })
  })

  describe('PUT /profile', () => {
    it('returns 400 for invalid JSON', async () => {
      const app = buildApp()
      const res = await app.request('/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid',
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid email format', async () => {
      const app = buildApp()
      const res = await app.request('/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid-email' }),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as any
      expect(body.detail).toBe('Invalid email format')
    })

    it('returns 400 if name is too long', async () => {
      const app = buildApp()
      const res = await app.request('/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'A'.repeat(101) }),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as any
      expect(body.detail).toContain('Name is too long')
    })

    it('returns 400 if surname is too long', async () => {
      const app = buildApp()
      const res = await app.request('/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surname: 'A'.repeat(101) }),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as any
      expect(body.detail).toContain('Surname is too long')
    })

    it('returns 400 if no fields to update are provided', async () => {
      const app = buildApp()
      const res = await app.request('/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as any
      expect(body.error).toBe('No fields to update')
    })

    it('returns 409 if email is already in use by another user', async () => {
      const app = buildApp({
        userRepository: {
          emailBelongsToAnotherUser: vi.fn().mockResolvedValue(true),
        },
      })
      const res = await app.request('/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'taken@beechcms.com' }),
      })
      expect(res.status).toBe(409)
      const body = await res.json() as any
      expect(body.detail).toBe('Email address is already in use')
    })

    it('updates user profile successfully', async () => {
      const updateProfileSpy = vi.fn().mockResolvedValue(undefined)
      const app = buildApp({
        userRepository: {
          emailBelongsToAnotherUser: vi.fn().mockResolvedValue(false),
          updateProfile: updateProfileSpy,
        },
      })
      const res = await app.request('/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'NewName', surname: 'NewSurname', email: 'new@beechcms.com' }),
      })
      expect(res.status).toBe(200)
      expect(updateProfileSpy).toHaveBeenCalledWith('u1', {
        name: 'NewName',
        surname: 'NewSurname',
        email: 'new@beechcms.com',
      })
    })
  })

  describe('PUT /password', () => {
    it('returns 400 if currentPassword or newPassword is missing', async () => {
      const app = buildApp()
      const res = await app.request('/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'pwd' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 if newPassword is too short', async () => {
      const app = buildApp()
      const res = await app.request('/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'pwd', newPassword: 'short' }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 if newPassword is too long', async () => {
      const app = buildApp()
      const res = await app.request('/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'pwd', newPassword: 'A'.repeat(129) }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 if newPassword exceeds 72 bytes even though under 128 characters', async () => {
      const app = buildApp()
      const res = await app.request('/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'pwd', newPassword: 'A'.repeat(73) }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 if newPassword exceeds 72 bytes due to multi-byte UTF-8 characters', async () => {
      const app = buildApp()
      const res = await app.request('/password', {
        method: 'PUT',
        // '€' is 3 bytes in UTF-8, so 25 chars = 75 bytes > 72
        body: JSON.stringify({ currentPassword: 'pwd', newPassword: '€'.repeat(25) }),
        headers: { 'Content-Type': 'application/json' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 if user is not found', async () => {
      const app = buildApp({
        userRepository: {
          findById: vi.fn().mockResolvedValue(null),
        },
      })
      const res = await app.request('/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'pwd', newPassword: 'new-valid-pwd' }),
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 if current password verification fails', async () => {
      const app = buildApp({
        hashProvider: {
          verify: vi.fn().mockResolvedValue(false),
        },
      })
      const res = await app.request('/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'pwd', newPassword: 'new-valid-pwd' }),
      })
      expect(res.status).toBe(401)
    })

    it('updates password successfully if current password is correct', async () => {
      const updatePasswordHashSpy = vi.fn().mockResolvedValue(undefined)
      const app = buildApp({
        userRepository: {
          findById: vi.fn().mockResolvedValue({ passwordHash: 'old-hash' }),
          updatePasswordHash: updatePasswordHashSpy,
        },
        hashProvider: {
          verify: vi.fn().mockResolvedValue(true),
          hash: vi.fn().mockResolvedValue('new-hashed-pwd'),
        },
      })
      const res = await app.request('/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'pwd', newPassword: 'new-valid-pwd' }),
      })
      expect(res.status).toBe(200)
      expect(updatePasswordHashSpy).toHaveBeenCalledWith('u1', 'new-hashed-pwd')
    })
  })

  describe('PUT /avatar', () => {
    it('updates avatar URL', async () => {
      const updateAvatarSpy = vi.fn().mockResolvedValue(undefined)
      const app = buildApp({
        userRepository: {
          updateAvatarUrl: updateAvatarSpy,
        },
      })
      const res = await app.request('/avatar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: 'https://beechcms.com/avatar.png' }),
      })
      expect(res.status).toBe(200)
      expect(updateAvatarSpy).toHaveBeenCalledWith('u1', 'https://beechcms.com/avatar.png')
    })
  })

  describe('GET /sessions', () => {
    it('returns a list of user active sessions', async () => {
      const app = buildApp()
      const res = await app.request('/sessions')
      expect(res.status).toBe(200)
      const body = await res.json() as any[]
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe('sess-1')
    })
  })

  describe('DELETE /sessions/:id', () => {
    it('returns 404 if session to revoke is not found', async () => {
      const app = buildApp({
        sessionRepository: {
          revokeById: vi.fn().mockResolvedValue(false),
        },
      })
      const res = await app.request('/sessions/unknown', {
        method: 'DELETE',
      })
      expect(res.status).toBe(404)
    })

    it('revokes session successfully', async () => {
      const revokeSpy = vi.fn().mockResolvedValue(true)
      const app = buildApp({
        sessionRepository: {
          revokeById: revokeSpy,
        },
      })
      const res = await app.request('/sessions/sess-1', {
        method: 'DELETE',
      })
      expect(res.status).toBe(200)
      expect(revokeSpy).toHaveBeenCalledWith('sess-1', 'u1', expect.any(Number))
    })
  })

  describe('GET /activity', () => {
    it('returns user activity logs in legacy format', async () => {
      const app = buildApp()
      const res = await app.request('/activity')
      expect(res.status).toBe(200)
      const body = await res.json() as any[]
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe('log-1')
      expect(body[0].entity_type).toBe('post')
      expect(body[0].entity_slug).toBe('first-post')
      expect(body[0].details).toBe('{"ip":"127.0.0.1"}')
    })
  })

  describe('GET /storage', () => {
    it('returns storage metrics and orphaned media files', async () => {
      const app = buildApp()
      const res = await app.request('/storage')
      expect(res.status).toBe(200)
      const body = await res.json() as any
      expect(body.totalBytes).toBe(3072)
      expect(body.fileCount).toBe(5)
      expect(body.orphans).toHaveLength(1)
      expect(body.orphans[0].key).toBe('media/img2.png')
    })
  })

  describe('GET /notifications', () => {
    it('returns user notification preferences', async () => {
      const app = buildApp()
      const res = await app.request('/notifications')
      expect(res.status).toBe(200)
      const body = await res.json() as any
      expect(body.contentCreate).toBe(true)
      expect(body.contentUpdate).toBe(false)
      expect(body.contentDelete).toBe(true)
      expect(body.mediaUpload).toBe(true)
    })
  })

  describe('PUT /notifications', () => {
    it('updates user notification preferences', async () => {
      const updateNotificationSpy = vi.fn().mockResolvedValue(undefined)
      const app = buildApp({
        userRepository: {
          updateNotificationPreferences: updateNotificationSpy,
        },
      })
      const res = await app.request('/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentCreate: true,
          contentUpdate: true,
          contentDelete: false,
          mediaUpload: false,
        }),
      })
      expect(res.status).toBe(200)
      expect(updateNotificationSpy).toHaveBeenCalledWith(
        'u1',
        JSON.stringify({
          contentCreate: true,
          contentUpdate: true,
          contentDelete: false,
          mediaUpload: false,
        })
      )
    })
  })
})
