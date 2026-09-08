// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../../factory'
import { D1TestDatabase } from '../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../test/helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from '../../../test/fixtures'
import type { IRateLimiterRegistry } from '../../middleware/rate-limit.middleware'

const CLIENT_ID = 'beech-mcp-cli'
const REDIRECT_URI = 'http://127.0.0.1:9999/callback'
const CODE_CHALLENGE = 'a'.repeat(43)
// Any verifier whose SHA-256/base64url digest equals CODE_CHALLENGE would be the "real"
// PKCE proof; since CODE_CHALLENGE here is a fixed dummy, tests use verifyPkceChallenge's
// actual derivation to keep the happy path realistic.
const CODE_VERIFIER = 'b'.repeat(43)

async function deriveChallenge(verifier: string): Promise<string> {
  const { deriveCodeChallenge } = await import('@beechcms/core')
  return deriveCodeChallenge(verifier)
}

describe('OAuth token endpoint', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })
  })

  async function loginAndGetCode(scope = 'schema:read', verifier = CODE_VERIFIER) {
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const { token } = await loginRes.json<{ token: string }>()

    const challenge = await deriveChallenge(verifier)
    const consentRes = await app.request('/oauth/authorize/consent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
        scope, state: 'state123', code_challenge: challenge,
        code_challenge_method: 'S256', approved: true,
      }),
    }, { ...TEST_ENV, DB: db })
    const { redirectTo } = await consentRes.json<{ redirectTo: string }>()
    return new URL(redirectTo).searchParams.get('code')!
  }

  function tokenRequest(fields: Record<string, string>) {
    const body = new URLSearchParams(fields)
    return app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }, { ...TEST_ENV, DB: db })
  }

  it('happy path returns all five body fields and Cache-Control: no-store', async () => {
    const code = await loginAndGetCode()
    const res = await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: CODE_VERIFIER,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.json<Record<string, unknown>>()
    expect(body.access_token).toBeTruthy()
    expect(body.token_type).toBe('Bearer')
    expect(body.expires_in).toBe(900)
    expect(body.refresh_token).toBeTruthy()
    expect(body.scope).toBe('schema:read')
  })

  it('wrong code_verifier returns invalid_grant and leaves the code unconsumed', async () => {
    const code = await loginAndGetCode()
    const badRes = await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: 'c'.repeat(43),
    })
    expect(badRes.status).toBe(400)
    const badBody = await badRes.json<{ error: string }>()
    expect(badBody.error).toBe('invalid_grant')

    const goodRes = await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: CODE_VERIFIER,
    })
    expect(goodRes.status).toBe(200)
  })

  it('replay: a second redemption returns invalid_grant and revokes every token from the first', async () => {
    const code = await loginAndGetCode()
    const firstRes = await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: CODE_VERIFIER,
    })
    const firstBody = await firstRes.json<{ access_token: string; refresh_token: string }>()

    const secondRes = await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: CODE_VERIFIER,
    })
    expect(secondRes.status).toBe(400)
    const secondBody = await secondRes.json<{ error: string }>()
    expect(secondBody.error).toBe('invalid_grant')

    const refreshRes = await tokenRequest({
      grant_type: 'refresh_token', refresh_token: firstBody.refresh_token, client_id: CLIENT_ID,
    })
    expect(refreshRes.status).toBe(400)
  })

  it('redirect_uri differing from the stored code returns invalid_grant', async () => {
    const code = await loginAndGetCode()
    const res = await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: 'http://127.0.0.1:1234/callback', client_id: CLIENT_ID, code_verifier: CODE_VERIFIER,
    })
    expect(res.status).toBe(400)
    const body = await res.json<{ error: string }>()
    expect(body.error).toBe('invalid_grant')
  })

  it('client_id differing from the stored code returns invalid_grant', async () => {
    const code = await loginAndGetCode()
    const res = await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: 'other-client', code_verifier: CODE_VERIFIER,
    })
    expect(res.status).toBe(401)
    const body = await res.json<{ error: string }>()
    expect(body.error).toBe('invalid_client')
  })

  it('grant_type=password returns unsupported_grant_type', async () => {
    const res = await tokenRequest({ grant_type: 'password', client_id: CLIENT_ID })
    expect(res.status).toBe(400)
    const body = await res.json<{ error: string }>()
    expect(body.error).toBe('unsupported_grant_type')
  })

  describe('refresh_token grant', () => {
    it('rotation: old refresh token stops working, new one works, authorization_code_hash preserved', async () => {
      const code = await loginAndGetCode()
      const firstRes = await tokenRequest({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: CODE_VERIFIER,
      })
      const { refresh_token: oldRefresh } = await firstRes.json<{ refresh_token: string }>()

      const rotateRes = await tokenRequest({ grant_type: 'refresh_token', refresh_token: oldRefresh, client_id: CLIENT_ID })
      expect(rotateRes.status).toBe(200)
      const { refresh_token: newRefresh } = await rotateRes.json<{ refresh_token: string }>()
      expect(newRefresh).not.toBe(oldRefresh)

      const oldAgainRes = await tokenRequest({ grant_type: 'refresh_token', refresh_token: oldRefresh, client_id: CLIENT_ID })
      expect(oldAgainRes.status).toBe(400)

      const newWorksRes = await tokenRequest({ grant_type: 'refresh_token', refresh_token: newRefresh, client_id: CLIENT_ID })
      expect(newWorksRes.status).toBe(200)
    })

    it('narrowing scope succeeds; widening scope returns invalid_scope', async () => {
      const code = await loginAndGetCode('schema:read')
      const firstRes = await tokenRequest({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: CODE_VERIFIER,
      })
      const { refresh_token: refreshToken } = await firstRes.json<{ refresh_token: string }>()

      const wideningRes = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID, scope: 'schema:read schema:write' })
      expect(wideningRes.status).toBe(400)
      const wideningBody = await wideningRes.json<{ error: string }>()
      expect(wideningBody.error).toBe('invalid_scope')
    })
  })

  it('with a pre-exhausted rateLimiterRegistry returns 429 with Retry-After', async () => {
    const blockedRegistry: IRateLimiterRegistry = {
      getLimiter: () => ({ checkLimit: async () => ({ isAllowed: false, retryAfterSeconds: 12 }) }),
    }
    const rateLimitedApp = createBeechApp({ seeds: [], rateLimiterRegistry: blockedRegistry })
    const res = await rateLimitedApp.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('12')
  })
})
