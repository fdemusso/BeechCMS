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
const CODE_CHALLENGE = 'a'.repeat(43)

function authorizeQuery(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'schema:read',
    state: 'state123',
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
    ...overrides,
  }).toString()
}

describe('OAuth authorize handlers', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })
  })

  async function login() {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const body = await res.json<{ token: string }>()
    return body.token
  }

  describe('GET /oauth/authorize', () => {
    it('unknown client_id returns 400 with no Location header', async () => {
      const res = await app.request(`/oauth/authorize?${authorizeQuery({ client_id: 'unknown-client' })}`, {}, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      expect(res.headers.get('Location')).toBeNull()
    })

    it('valid request redirects to the consent screen with the byte-identical query', async () => {
      const query = authorizeQuery()
      const res = await app.request(`/oauth/authorize?${query}`, { redirect: 'manual' }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(302)
      const location = res.headers.get('Location')!
      const url = new URL(location)
      expect(url.pathname).toBe('/admin/oauth/consent')
      expect(url.search.slice(1)).toBe(query)
    })
  })

  describe('GET /oauth/authorize/request', () => {
    it('without a Bearer token returns 401', async () => {
      const res = await app.request(`/oauth/authorize/request?${authorizeQuery()}`, {}, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(401)
    })

    it('consentRequired is true on first request and false once a live consent covers the scope', async () => {
      const token = await login()
      const query = authorizeQuery()

      const first = await app.request(`/oauth/authorize/request?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, { ...TEST_ENV, DB: db })
      const firstBody = await first.json<{ consentRequired: boolean; newScopes: string[] }>()
      expect(firstBody.consentRequired).toBe(true)
      expect(firstBody.newScopes).toEqual(['schema:read'])

      // Grant consent for schema:read via the consent endpoint.
      await app.request('/oauth/authorize/consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
          scope: 'schema:read', state: 'state123', code_challenge: CODE_CHALLENGE,
          code_challenge_method: 'S256', approved: true,
        }),
      }, { ...TEST_ENV, DB: db })

      const second = await app.request(`/oauth/authorize/request?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, { ...TEST_ENV, DB: db })
      const secondBody = await second.json<{ consentRequired: boolean; newScopes: string[] }>()
      expect(secondBody.consentRequired).toBe(false)
      expect(secondBody.newScopes).toEqual([])

      // Requesting a superset re-prompts only for the delta.
      const superset = authorizeQuery({ scope: 'schema:read schema:write' })
      const third = await app.request(`/oauth/authorize/request?${superset}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, { ...TEST_ENV, DB: db })
      const thirdBody = await third.json<{ consentRequired: boolean; newScopes: string[] }>()
      expect(thirdBody.consentRequired).toBe(true)
      expect(thirdBody.newScopes).toEqual(['schema:write'])
    })
  })

  describe('POST /oauth/authorize/consent', () => {
    it('approved: false returns redirectTo with error=access_denied and echoes state', async () => {
      const token = await login()
      const res = await app.request('/oauth/authorize/consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
          scope: 'schema:read', state: 'state123', code_challenge: CODE_CHALLENGE,
          code_challenge_method: 'S256', approved: false,
        }),
      }, { ...TEST_ENV, DB: db })
      const body = await res.json<{ redirectTo: string }>()
      const url = new URL(body.redirectTo)
      expect(url.searchParams.get('error')).toBe('access_denied')
      expect(url.searchParams.get('state')).toBe('state123')
    })

    it('a role guard granting nothing returns access_denied', async () => {
      const token = await login()
      const denyAllGuard = { arbitrate: async () => ({ grantedScopes: [], deniedScopes: ['schema:read' as const] }) }
      const restrictedApp = createBeechApp({ seeds: [], roleGuard: denyAllGuard })

      const res = await restrictedApp.request('/oauth/authorize/consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
          scope: 'schema:read', state: 'state123', code_challenge: CODE_CHALLENGE,
          code_challenge_method: 'S256', approved: true,
        }),
      }, { ...TEST_ENV, DB: db })
      const body = await res.json<{ redirectTo: string }>()
      const url = new URL(body.redirectTo)
      expect(url.searchParams.get('error')).toBe('access_denied')
    })

    it('a partial grant stores only the granted subset', async () => {
      const token = await login()
      const partialGuard = {
        arbitrate: async (_role: string | undefined, requested: readonly string[]) => ({
          grantedScopes: requested.filter(scope => scope === 'schema:read'),
          deniedScopes: requested.filter(scope => scope !== 'schema:read'),
        }),
      }
      const restrictedApp = createBeechApp({ seeds: [], roleGuard: partialGuard as any })

      const res = await restrictedApp.request('/oauth/authorize/consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
          scope: 'schema:read schema:write', state: 'state123', code_challenge: CODE_CHALLENGE,
          code_challenge_method: 'S256', approved: true,
        }),
      }, { ...TEST_ENV, DB: db })
      const body = await res.json<{ redirectTo: string }>()
      const url = new URL(body.redirectTo)
      expect(url.searchParams.has('code')).toBe(true)

      const row = await db.prepare('SELECT scope FROM oauth_authorization_codes').first<{ scope: string }>()
      expect(row?.scope).toBe('schema:read')
    })

    it('happy path writes exactly one authorization_codes row hashed, plaintext code appears nowhere', async () => {
      const token = await login()
      const res = await app.request('/oauth/authorize/consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
          scope: 'schema:read', state: 'state123', code_challenge: CODE_CHALLENGE,
          code_challenge_method: 'S256', approved: true,
        }),
      }, { ...TEST_ENV, DB: db })
      const body = await res.json<{ redirectTo: string }>()
      const code = new URL(body.redirectTo).searchParams.get('code')!
      expect(code).toBeTruthy()

      const rows = await db.prepare('SELECT code_hash FROM oauth_authorization_codes').all<{ code_hash: string }>()
      expect(rows.results.length).toBe(1)
      expect(rows.results[0]!.code_hash).not.toBe(code)

      const { sha256hex } = await import('@beechcms/core')
      expect(rows.results[0]!.code_hash).toBe(await sha256hex(code))
    })
  })
})
