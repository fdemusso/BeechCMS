// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { deriveCodeChallenge } from '@beechcms/core'
import { createBeechApp } from '../../factory'
import { D1TestDatabase } from '../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../test/helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from '../../../test/fixtures'

const CLIENT_ID = 'beech-mcp-cli'
const REDIRECT_URI = 'http://127.0.0.1:8976/callback'
const CODE_VERIFIER = 'a'.repeat(64)

describe('OAuth connected-apps handlers', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })
  })

  async function login(email: string) {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const body = await res.json<{ token: string }>()
    return body.token
  }

  /** Runs authorize -> consent -> token, leaving the user with a live grant. */
  async function grantConsent(adminToken: string) {
    const codeChallenge = await deriveCodeChallenge(CODE_VERIFIER)
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'schema:read',
      state: 'state123',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString()

    const consentRes = await app.request('/oauth/authorize/consent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'schema:read',
        state: 'state123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        approved: true,
      }),
    }, { ...TEST_ENV, DB: db })
    const { redirectTo } = await consentRes.json<{ redirectTo: string }>()
    const code = new URL(redirectTo).searchParams.get('code')!

    const tokenRes = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: CODE_VERIFIER,
      }).toString(),
    }, { ...TEST_ENV, DB: db })
    return tokenRes.json<{ access_token: string; refresh_token: string }>()
  }

  describe('GET /oauth/consents', () => {
    it('rejects a request without a JWT', async () => {
      const res = await app.request('/oauth/consents', {}, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })

    it('returns an empty list for a user with no consents', async () => {
      const adminToken = await login(TEST_USERS[0].email)
      const res = await app.request('/oauth/consents', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns a live consent with client name, scopes and active-token liveness', async () => {
      const adminToken = await login(TEST_USERS[0].email)
      await grantConsent(adminToken)

      const res = await app.request('/oauth/consents', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const apps = await res.json<Array<{ clientId: string; name: string; scopes: string[]; hasActiveTokens: boolean; lastIssuedAt: number | null }>>()
      expect(apps).toHaveLength(1)
      expect(apps[0].clientId).toBe(CLIENT_ID)
      expect(apps[0].name).toBeTruthy()
      expect(apps[0].scopes).toEqual(['schema:read'])
      expect(apps[0].hasActiveTokens).toBe(true)
      expect(apps[0].lastIssuedAt).not.toBeNull()
    })

    it('reports no active tokens once the only token has expired', async () => {
      const adminToken = await login(TEST_USERS[0].email)
      await grantConsent(adminToken)
      await db.prepare(`UPDATE oauth_tokens SET expires_at = 1 WHERE client_id = ?`).bind(CLIENT_ID).run()

      const res = await app.request('/oauth/consents', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      const apps = await res.json<Array<{ hasActiveTokens: boolean; lastIssuedAt: number | null }>>()
      expect(apps[0].hasActiveTokens).toBe(false)
      expect(apps[0].lastIssuedAt).toBeNull()
    })

    it('falls back the display name to clientId when the client is disabled', async () => {
      const adminToken = await login(TEST_USERS[0].email)
      await grantConsent(adminToken)
      await db.prepare(`UPDATE oauth_clients SET disabled_at = unixepoch() WHERE client_id = ?`).bind(CLIENT_ID).run()

      const res = await app.request('/oauth/consents', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      const apps = await res.json<Array<{ name: string }>>()
      expect(apps[0].name).toBe(CLIENT_ID)
    })

    it('does not list consents belonging to another user', async () => {
      const adminToken = await login(TEST_USERS[0].email)
      await grantConsent(adminToken)

      const otherToken = await login(TEST_USERS[1].email)
      const res = await app.request('/oauth/consents', {
        headers: { Authorization: `Bearer ${otherToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(await res.json()).toEqual([])
    })
  })

  describe('DELETE /oauth/consents/:clientId', () => {
    it('cascade-revokes the consent and its tokens, removing it from a subsequent list', async () => {
      const adminToken = await login(TEST_USERS[0].email)
      await grantConsent(adminToken)

      const res = await app.request(`/oauth/consents/${CLIENT_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      const body = await res.json<{ revoked: boolean; tokensRevoked: number }>()
      expect(body.revoked).toBe(true)
      expect(body.tokensRevoked).toBeGreaterThan(0)

      const listRes = await app.request('/oauth/consents', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(await listRes.json()).toEqual([])
    })

    it('returns 404 for a client the user never authorized', async () => {
      const adminToken = await login(TEST_USERS[0].email)
      const res = await app.request(`/oauth/consents/${CLIENT_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)
      const body = await res.json<{ error: string }>()
      expect(body.error).toBe('not_found')
    })

    it('cannot be revoked by a different user', async () => {
      const adminToken = await login(TEST_USERS[0].email)
      await grantConsent(adminToken)

      const otherToken = await login(TEST_USERS[1].email)
      const res = await app.request(`/oauth/consents/${CLIENT_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${otherToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)

      const listRes = await app.request('/oauth/consents', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })
      expect(await listRes.json()).toHaveLength(1)
    })
  })
})
