// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { deriveCodeChallenge } from '@beechcms/core'
import { createBeechApp } from '../../src/factory'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { seedTestUsers } from '../helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from '../fixtures'

const CLIENT_ID = 'beech-mcp-cli'
const REDIRECT_URI = 'http://127.0.0.1:8976/callback'
const CODE_VERIFIER = 'a'.repeat(64)

describe('Flow: OAuth connected-apps cascade revocation', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })
  })

  it('login -> authorize -> consent -> token -> list -> revoke -> token rejected', async () => {
    // 1. Login
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const { token: adminToken } = await loginRes.json<{ token: string }>()

    // 2. Authorize + consent -> code
    const codeChallenge = await deriveCodeChallenge(CODE_VERIFIER)
    const consentRes = await app.request('/oauth/authorize/consent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'schema:read schema:write',
        state: 'flow-state',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        approved: true,
      }),
    }, { ...TEST_ENV, DB: db })
    const { redirectTo } = await consentRes.json<{ redirectTo: string }>()
    const code = new URL(redirectTo).searchParams.get('code')!

    // 3. Token exchange
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
    const { access_token: accessToken, refresh_token: refreshToken } =
      await tokenRes.json<{ access_token: string; refresh_token: string }>()

    // 4. GET /oauth/consents -> one row, live tokens
    const listRes = await app.request('/oauth/consents', {
      headers: { Authorization: `Bearer ${adminToken}` },
    }, { ...TEST_ENV, DB: db })
    expect(listRes.status).toBe(200)
    const apps = await listRes.json<Array<{ clientId: string; hasActiveTokens: boolean }>>()
    expect(apps).toHaveLength(1)
    expect(apps[0].hasActiveTokens).toBe(true)

    // 4b. An OAuth access token must never see this endpoint (admin JWT only)
    const oauthGatedRes = await app.request('/oauth/consents', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, { ...TEST_ENV, DB: db })
    expect(oauthGatedRes.status).toBe(401)

    // 5. DELETE /oauth/consents/:clientId -> cascade revoke
    const revokeRes = await app.request(`/oauth/consents/${CLIENT_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }, { ...TEST_ENV, DB: db })
    expect(revokeRes.status).toBe(200)
    const revokeBody = await revokeRes.json<{ tokensRevoked: number }>()
    expect(revokeBody.tokensRevoked).toBeGreaterThanOrEqual(2)

    // 6. GET /oauth/consents -> empty
    const listAfterRes = await app.request('/oauth/consents', {
      headers: { Authorization: `Bearer ${adminToken}` },
    }, { ...TEST_ENV, DB: db })
    expect(await listAfterRes.json()).toEqual([])

    // 7. Resource server must reject the revoked access token
    const seedsRes = await app.request('/api/seeds', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, { ...TEST_ENV, DB: db })
    expect(seedsRes.status).toBe(401)

    // 8. Refresh with the revoked refresh token must fail
    const refreshRes = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(refreshRes.status).toBe(400)
    const refreshBody = await refreshRes.json<{ error: string }>()
    expect(refreshBody.error).toBe('invalid_grant')
  })
})
