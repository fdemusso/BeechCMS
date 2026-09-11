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
// Deliberately a different port than the registered redirect_uri, to prove
// loopback port-agnostic matching end to end (OAuth 2.1 §8.4.2).
const REDIRECT_URI = 'http://127.0.0.1:8976/callback'
const CODE_VERIFIER = 'a'.repeat(64)

describe('Flow: OAuth 2.1 Authorization', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })
  })

  it('runs the full loop: login -> authorize -> consent -> code -> token -> refresh -> revoke', async () => {
    // 1. Login
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    expect(loginRes.status).toBe(200)
    const { token: adminToken } = await loginRes.json<{ token: string }>()

    // 2. GET /oauth/authorize -> redirect to consent screen
    const codeChallenge = await deriveCodeChallenge(CODE_VERIFIER)
    const authorizeQuery = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'schema:read schema:write',
      state: 'integration-state',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString()

    const authorizeRes = await app.request(`/oauth/authorize?${authorizeQuery}`, { redirect: 'manual' }, { ...TEST_ENV, DB: db })
    expect(authorizeRes.status).toBe(302)
    const consentLocation = authorizeRes.headers.get('Location')!
    expect(new URL(consentLocation, 'http://localhost').pathname).toBe('/admin/oauth/consent')

    // 3. GET /oauth/authorize/request with admin JWT
    const requestRes = await app.request(`/oauth/authorize/request?${authorizeQuery}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }, { ...TEST_ENV, DB: db })
    expect(requestRes.status).toBe(200)
    const requestBody = await requestRes.json<{ consentRequired: boolean }>()
    expect(requestBody.consentRequired).toBe(true)

    // 4. POST /oauth/authorize/consent -> extract code from redirectTo
    const consentRes = await app.request('/oauth/authorize/consent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'schema:read schema:write',
        state: 'integration-state',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        approved: true,
      }),
    }, { ...TEST_ENV, DB: db })
    expect(consentRes.status).toBe(200)
    const { redirectTo } = await consentRes.json<{ redirectTo: string }>()
    const redirectUrl = new URL(redirectTo)
    expect(redirectUrl.searchParams.get('state')).toBe('integration-state')
    const code = redirectUrl.searchParams.get('code')!
    expect(code).toBeTruthy()

    // 5. POST /oauth/token (authorization_code)
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
    expect(tokenRes.status).toBe(200)
    expect(tokenRes.headers.get('Cache-Control')).toBe('no-store')
    const tokenBody = await tokenRes.json<{ access_token: string; refresh_token: string; scope: string }>()
    expect(tokenBody.scope).toBe('schema:read schema:write')

    // 6. POST /oauth/token (refresh_token)
    const refreshRes = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenBody.refresh_token,
        client_id: CLIENT_ID,
      }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(refreshRes.status).toBe(200)
    const refreshBody = await refreshRes.json<{ access_token: string; refresh_token: string }>()
    expect(refreshBody.refresh_token).not.toBe(tokenBody.refresh_token)

    // 7. POST /oauth/revoke
    const revokeRes = await app.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshBody.refresh_token, client_id: CLIENT_ID }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(revokeRes.status).toBe(200)

    // 8. Refresh again -> invalid_grant
    const secondRefreshRes = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshBody.refresh_token,
        client_id: CLIENT_ID,
      }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(secondRefreshRes.status).toBe(400)
    const secondRefreshBody = await secondRefreshRes.json<{ error: string }>()
    expect(secondRefreshBody.error).toBe('invalid_grant')
  })
})
