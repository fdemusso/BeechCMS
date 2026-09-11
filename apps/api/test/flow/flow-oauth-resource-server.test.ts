// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { deriveCodeChallenge } from '@beechcms/core'
import { createBeechApp } from '../../src/factory'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { seedTestUsers } from '../helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from '../fixtures'

const CLIENT_ID = 'beech-mcp-cli'
const REDIRECT_URI = 'http://127.0.0.1:8977/callback'
const CODE_VERIFIER = 'b'.repeat(64)
const SEED_SLUG = 'articles'

const CANDIDATE_SEED = {
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text' },
    { alias: 'body', label: 'Body', type: 'richtext' },
  ],
}

async function requestConsent(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase, adminToken: string, scope: string, state: string) {
  const codeChallenge = await deriveCodeChallenge(CODE_VERIFIER)
  const consentRes = await app.request('/oauth/authorize/consent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      approved: true,
    }),
  }, { ...TEST_ENV, DB: db })
  expect(consentRes.status).toBe(200)
  const { redirectTo } = await consentRes.json<{ redirectTo: string }>()
  return new URL(redirectTo).searchParams.get('code')!
}

async function exchangeCode(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase, code: string) {
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
  return tokenRes.json<{ access_token: string; refresh_token: string; scope: string }>()
}

async function issueToken(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase, adminToken: string, scope: string, state: string) {
  const code = await requestConsent(app, db, adminToken, scope, state)
  return exchangeCode(app, db, code)
}

describe('Flow: OAuth 2.1 Resource Server (scope enforcement)', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let adminToken: string

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })

    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    expect(loginRes.status).toBe(200)
    adminToken = (await loginRes.json<{ token: string }>()).token
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('read-scoped token: happy path across all read-backed MCP routes, and admin gate is satisfied', async () => {
    const readToken = await issueToken(app, db, adminToken, 'schema:read', 'state-read')
    const auth = { Authorization: `Bearer ${readToken.access_token}` }

    const listRes = await app.request('/api/seeds', { headers: auth }, { ...TEST_ENV, DB: db })
    expect(listRes.status).toBe(200)

    // Create the seed first (via admin JWT) so /api/seeds/:slug and mcp-plan have a target.
    const createRes = await app.request(`/api/seeds/${SEED_SLUG}/mcp-apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: CANDIDATE_SEED, expectedVersion: 1, planId: 'seed-init' }),
    }, { ...TEST_ENV, DB: db })
    console.log('CREATE STATUS', createRes.status, await createRes.clone().text()); expect(createRes.status).toBe(200)

    const getSeedRes = await app.request(`/api/seeds/${SEED_SLUG}`, { headers: auth }, { ...TEST_ENV, DB: db })
    expect(getSeedRes.status).toBe(200)

    const schemaRes = await app.request('/api/schema', { headers: auth }, { ...TEST_ENV, DB: db })
    expect(schemaRes.status).toBe(200)

    const planRes = await app.request(`/api/seeds/${SEED_SLUG}/mcp-plan`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: { ...CANDIDATE_SEED, branches: [...CANDIDATE_SEED.branches, { alias: 'views', label: 'Views', type: 'number' }] } }),
    }, { ...TEST_ENV, DB: db })
    expect(planRes.status).toBe(200)
    const planBody = await planRes.json<{ classification: string; expectedVersion: number }>()
    expect(planBody.classification).toBe('additive')

    // Regression: requireAdmin (in-slice) is satisfied via hydrated jwtPayload — not a 403.
    expect(listRes.status).not.toBe(403)
    expect(getSeedRes.status).not.toBe(403)
  })

  it('write-scoped token: mcp-apply succeeds for the plan produced by a read-scoped call, audit actor is the resource owner', async () => {
    await app.request(`/api/seeds/${SEED_SLUG}/mcp-apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: CANDIDATE_SEED, expectedVersion: 1, planId: 'seed-init' }),
    }, { ...TEST_ENV, DB: db })

    const rwToken = await issueToken(app, db, adminToken, 'schema:read schema:write', 'state-rw')
    const auth = { Authorization: `Bearer ${rwToken.access_token}` }

    const candidateWithExtra = { ...CANDIDATE_SEED, branches: [...CANDIDATE_SEED.branches, { alias: 'views', label: 'Views', type: 'number' }] }
    const planRes = await app.request(`/api/seeds/${SEED_SLUG}/mcp-plan`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: candidateWithExtra }),
    }, { ...TEST_ENV, DB: db })
    const plan = await planRes.json<{ expectedVersion: number }>()

    const applyRes = await app.request(`/api/seeds/${SEED_SLUG}/mcp-apply`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: candidateWithExtra, expectedVersion: plan.expectedVersion, planId: 'mcp-apply-flow' }),
    }, { ...TEST_ENV, DB: db })
    expect(applyRes.status).toBe(200)

    const logRow = await db.prepare(
      `SELECT user_id, user_email FROM activity_logs WHERE entity_type = 'seed' AND entity_id = '${SEED_SLUG}' AND details LIKE '%"op":"mcp-apply"%' ORDER BY created_at DESC LIMIT 1`,
    ).first<{ user_id: string; user_email: string }>()
    expect(logRow?.user_id).toBe(TEST_USERS[0].id)
    expect(logRow?.user_email).toBe(TEST_USERS[0].email)
    expect(logRow?.user_id).not.toBe('unknown')
  })

  it('scope escalation refused: a read-only token gets 403 insufficient_scope on mcp-apply', async () => {
    await app.request(`/api/seeds/${SEED_SLUG}/mcp-apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: CANDIDATE_SEED, expectedVersion: 1, planId: 'seed-init' }),
    }, { ...TEST_ENV, DB: db })

    const readToken = await issueToken(app, db, adminToken, 'schema:read', 'state-escalate')
    const res = await app.request(`/api/seeds/${SEED_SLUG}/mcp-apply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${readToken.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: CANDIDATE_SEED, expectedVersion: 1, planId: 'escalate' }),
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(403)
    const body = await res.json<{ error: string }>()
    expect(body.error).toBe('insufficient_scope')
  })

  it('default deny: even the maximal token is refused on unlisted API routes', async () => {
    const maxToken = await issueToken(app, db, adminToken, 'schema:read schema:write', 'state-maximal')
    const auth = { Authorization: `Bearer ${maxToken.access_token}` }

    const contentRes = await app.request(`/api/content/${SEED_SLUG}`, { headers: auth }, { ...TEST_ENV, DB: db })
    expect(contentRes.status).toBe(403)

    const settingsRes = await app.request('/api/settings', { headers: auth }, { ...TEST_ENV, DB: db })
    expect(settingsRes.status).toBe(403)
  })

  it('revocation is immediate: a revoked access token gets 401 invalid_token, not 403', async () => {
    const token = await issueToken(app, db, adminToken, 'schema:read', 'state-revoke')

    const revokeRes = await app.request('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: token.access_token, client_id: CLIENT_ID }).toString(),
    }, { ...TEST_ENV, DB: db })
    expect(revokeRes.status).toBe(200)

    const res = await app.request('/api/seeds', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('error="invalid_token"')
  })

  it('expiry is 401: an access token past its TTL gets invalid_token, not insufficient_scope', async () => {
    const token = await issueToken(app, db, adminToken, 'schema:read', 'state-expiry')

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 16 * 60 * 1000) // past ACCESS_TOKEN_TTL_SECONDS (900s)

    const res = await app.request('/api/seeds', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('error="invalid_token"')
  })

  it('JWT path is unaffected: the admin JWT still reaches routes the OAuth gate would deny', async () => {
    const contentRes = await app.request(`/api/content/${SEED_SLUG}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }, { ...TEST_ENV, DB: db })
    expect(contentRes.status).not.toBe(403)

    const settingsRes = await app.request('/api/settings', {
      headers: { Authorization: `Bearer ${adminToken}` },
    }, { ...TEST_ENV, DB: db })
    expect(settingsRes.status).not.toBe(403)
  })

  it('a refresh token presented as a Bearer access token is rejected 401', async () => {
    const token = await issueToken(app, db, adminToken, 'schema:read', 'state-refresh-as-access')
    const res = await app.request('/api/seeds', {
      headers: { Authorization: `Bearer ${token.refresh_token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(401)
  })

  it('the consent API is not OAuth-reachable: a maximal access token gets 401, never mints a code', async () => {
    const maxToken = await issueToken(app, db, adminToken, 'schema:read schema:write', 'state-privilege')
    const codeChallenge = await deriveCodeChallenge(CODE_VERIFIER)
    const authorizeQuery = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'schema:read schema:write',
      state: 'privilege-escalation-attempt',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString()

    const res = await app.request(`/oauth/authorize/request?${authorizeQuery}`, {
      headers: { Authorization: `Bearer ${maxToken.access_token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(401)
  })

  it('custom protected routes stay JWT-only: a maximal access token is refused', async () => {
    const customApp = createBeechApp({
      seeds: [],
      customRoutes: ({ protectedRouter }) => {
        protectedRouter.get('/probe', (c) => c.json({ ok: true }))
      },
    })
    const maxToken = await issueToken(customApp, db, adminToken, 'schema:read schema:write', 'state-custom')

    const res = await customApp.request('/api/custom/probe', {
      headers: { Authorization: `Bearer ${maxToken.access_token}` },
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(401)
  })
})
