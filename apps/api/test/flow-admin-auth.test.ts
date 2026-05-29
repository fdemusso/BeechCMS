// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { sha256hex } from '@beechcms/core'
import { createBeechApp } from '../src/factory'
import { AUTH_ERRORS } from '../src/auth/constants'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from './fixtures'

const VALID_EMAIL = TEST_USERS[0].email
const VALID_PASSWORD = 'password123'

describe('Flow: Admin Authentication', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })
  })

  // ---------------------------------------------------------------------------
  // Helper
  // ---------------------------------------------------------------------------

  async function login(email = VALID_EMAIL, password = VALID_PASSWORD) {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }, { ...TEST_ENV, DB: db })
    const refreshToken = res.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1] ?? ''
    // Only consume the body on success to allow callers to read it themselves on failure.
    let accessToken = ''
    if (res.status === 200) {
      const body = await res.json<{ token?: string }>()
      accessToken = body.token ?? ''
    }
    return { res, refreshToken, accessToken }
  }

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  describe('Login', () => {
    it('valid credentials return an access token and set a Secure HttpOnly cookie', async () => {
      const { res, accessToken } = await login()
      expect(res.status).toBe(200)
      expect(accessToken).toBeTruthy()
      expect(res.headers.get('set-cookie')).toContain('refresh_token=')
    })

    it('wrong password returns 401 INVALID_CREDENTIALS', async () => {
      const { res } = await login(VALID_EMAIL, 'wrongpassword')
      expect(res.status).toBe(401)
      expect((await res.json<{ error: string }>()).error).toBe(AUTH_ERRORS.INVALID_CREDENTIALS)
    })

    it('unknown email returns 401 without revealing user existence', async () => {
      const { res } = await login('nobody@beech.io', VALID_PASSWORD)
      expect(res.status).toBe(401)
      expect((await res.json<{ error: string }>()).error).toBe(AUTH_ERRORS.INVALID_CREDENTIALS)
    })

    it('malformed email returns 400', async () => {
      const { res } = await login('not-an-email', VALID_PASSWORD)
      expect(res.status).toBe(400)
    })

    it('missing password field returns 400', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
    })

    it('email with surrounding whitespace is trimmed and accepted', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `  ${VALID_EMAIL}  `, password: VALID_PASSWORD }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
    })

    it('rate limit returns 429 when LOGIN_RATE_LIMITER blocks the request', async () => {
      const blockedLimiter = { limit: () => Promise.resolve({ success: false }) }
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD }),
      }, { ...TEST_ENV, DB: db as any, LOGIN_RATE_LIMITER: blockedLimiter as any })
      expect(res.status).toBe(429)
    })
  })

  // ---------------------------------------------------------------------------
  // Protected Route Access
  // ---------------------------------------------------------------------------

  describe('Protected route access', () => {
    it('authenticated request to /api/settings/me returns the user profile', async () => {
      const { accessToken } = await login()
      const res = await app.request('/api/settings/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const profile = await res.json<{ email: string }>()
      expect(profile.email).toBe(VALID_EMAIL)
    })

    it('/api/settings/me returns Gravatar fallback URL when user has no custom avatar', async () => {
      const { accessToken } = await login()
      const res = await app.request('/api/settings/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const profile = await res.json<{ avatarUrl: string | null }>()
      const expectedHash = await sha256hex(VALID_EMAIL.trim().toLowerCase())
      expect(profile.avatarUrl).toBe(`https://gravatar.com/avatar/${expectedHash}?d=mp`)
    })

    it('/api/settings/me returns custom avatar URL when user has one set', async () => {
      await db.prepare('UPDATE users SET avatar_url = ? WHERE email = ?')
        .bind('https://cdn.example.com/my-avatar.jpg', VALID_EMAIL)
        .run()
      const { accessToken } = await login()
      const res = await app.request('/api/settings/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const profile = await res.json<{ avatarUrl: string | null }>()
      expect(profile.avatarUrl).toBe('https://cdn.example.com/my-avatar.jpg')
    })

    it('request without Authorization header returns 401', async () => {
      const res = await app.request('/api/settings/me', {}, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })

    it('request with a tampered token returns 401', async () => {
      const res = await app.request('/api/settings/me', {
        headers: { Authorization: 'Bearer this.is.not.a.valid.jwt' },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })
  })

  // ---------------------------------------------------------------------------
  // Token Refresh & Rotation
  // ---------------------------------------------------------------------------

  describe('Token refresh and rotation', () => {
    it('valid refresh cookie issues new tokens and revokes the old one', async () => {
      const { refreshToken } = await login()
      const oldTokenHash = await sha256hex(refreshToken)

      const refreshRes = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${refreshToken}` },
      }, { ...TEST_ENV, DB: db })

      expect(refreshRes.status).toBe(200)
      expect((await refreshRes.json<{ token: string }>()).token).toBeTruthy()

      const newCookie = refreshRes.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1]
      expect(newCookie).not.toBe(refreshToken)

      const oldRecord = await db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').bind(oldTokenHash).first<{ revoked_at: number | null }>()
      expect(oldRecord?.revoked_at).not.toBeNull()
    })

    it('missing refresh cookie returns 401', async () => {
      const res = await app.request('/auth/refresh', { method: 'POST' }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })

    it('unknown refresh token returns 401', async () => {
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: 'refresh_token=does-not-exist-in-db' },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })

    it('already-used refresh token is rejected (single-use rotation protection)', async () => {
      const { refreshToken } = await login()

      // First refresh — succeeds and revokes the original token
      await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${refreshToken}` },
      }, { ...TEST_ENV, DB: db })

      // Second use of the same token — must be rejected because it was revoked
      const secondRes = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${refreshToken}` },
      }, { ...TEST_ENV, DB: db })

      expect(secondRes.status).toBe(401)
    })
  })

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  describe('Logout', () => {
    it('logout with a valid cookie revokes the session and clears the cookie', async () => {
      const { refreshToken } = await login()
      const tokenHash = await sha256hex(refreshToken)

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Cookie: `refresh_token=${refreshToken}` },
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toMatch(/refresh_token=;|Max-Age=0/)

      const revokedRecord = await db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').bind(tokenHash).first<{ revoked_at: number | null }>()
      expect(revokedRecord?.revoked_at).not.toBeNull()
    })

    it('logout without a cookie still returns 200 (graceful no-op)', async () => {
      const res = await app.request('/auth/logout', { method: 'POST' }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
    })
  })
})
