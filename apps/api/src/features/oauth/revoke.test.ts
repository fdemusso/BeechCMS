// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../../factory'
import { D1TestDatabase } from '../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../test/helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from '../../../test/fixtures'

const CLIENT_ID = 'beech-mcp-cli'
const REDIRECT_URI = 'http://127.0.0.1:9999/callback'
const CODE_VERIFIER = 'b'.repeat(43)

async function deriveChallenge(verifier: string): Promise<string> {
  const { deriveCodeChallenge } = await import('@beechcms/core')
  return deriveCodeChallenge(verifier)
}

describe('POST /oauth/revoke', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })
  })

  async function issueTokenPair() {
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const { token } = await loginRes.json<{ token: string }>()

    const challenge = await deriveChallenge(CODE_VERIFIER)
    const consentRes = await app.request('/oauth/authorize/consent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
        scope: 'schema:read', state: 's', code_challenge: challenge,
        code_challenge_method: 'S256', approved: true,
      }),
    }, { ...TEST_ENV, DB: db })
    const { redirectTo } = await consentRes.json<{ redirectTo: string }>()
    const code = new URL(redirectTo).searchParams.get('code')!

    const tokenRes = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: CODE_VERIFIER }).toString(),
    }, { ...TEST_ENV, DB: db })
    return tokenRes.json<{ access_token: string; refresh_token: string }>()
  }

  function refreshWorks(refreshToken: string) {
    return app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID }).toString(),
    }, { ...TEST_ENV, DB: db })
  }

  it('revoking an access token also kills its sibling refresh token', async () => {
    const { access_token: accessToken, refresh_token: refreshToken } = await issueTokenPair()

    const res = await app.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken, client_id: CLIENT_ID }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})

    const refreshRes = await refreshWorks(refreshToken)
    expect(refreshRes.status).toBe(400)
  })

  it('revoking a refresh token also kills its sibling access token', async () => {
    const { refresh_token: refreshToken } = await issueTokenPair()

    await app.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken, client_id: CLIENT_ID, token_type_hint: 'refresh_token' }).toString(),
    }, { ...TEST_ENV, DB: db })

    const refreshRes = await refreshWorks(refreshToken)
    expect(refreshRes.status).toBe(400)
  })

  it('unknown token returns 200 {}', async () => {
    const res = await app.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'nonexistent', client_id: CLIENT_ID }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('client_id mismatch returns 200 {} and the token stays alive', async () => {
    const { access_token: accessToken, refresh_token: refreshToken } = await issueTokenPair()

    const res = await app.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken, client_id: 'someone-else' }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(200)

    const refreshRes = await refreshWorks(refreshToken)
    expect(refreshRes.status).toBe(200)
  })

  it('missing token returns 400', async () => {
    const res = await app.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(400)
  })
})
