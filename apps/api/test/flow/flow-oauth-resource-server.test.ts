// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { deriveCodeChallenge } from '@beechcms/core'
import { createBeechApp } from '../../src/factory'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { seedTestUsers } from '../helpers/seed-fixtures'
import { SequentialIdGenerator } from '../../src/shared/services/id-generator/sequential-id-generator'
import { D1RoleRepository } from '../../src/shared/db/repositories/d1-role.repository'
import { D1RoleAssignmentRepository } from '../../src/shared/db/repositories/d1-role-assignment.repository'
import { TEST_USERS, TEST_ENV } from '../fixtures'
import {
  CANDIDATE_SEED, CLI_SCOPES, CODE_VERIFIER, DEFAULT_CLIENT_ID as CLIENT_ID, REDIRECT_URI, SEED_SLUG,
  createTargetSeed, issueToken,
} from '../helpers/oauth-flow'

const CLI_ALLOWED_SCOPES = 'schema:read schema:write content:read content:write content:delete media:read media:write automations:read automations:write users:read users:write settings:read settings:write analytics:read agent:read'
const MCP_ALLOWED_SCOPES = `${CLI_ALLOWED_SCOPES} agent:approve`

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
    await createTargetSeed(app, db, adminToken)

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

    // Regression: the `manage_seeds@*` route gate is satisfied by the resource owner's permissions — not a 403.
    expect(listRes.status).not.toBe(403)
    expect(getSeedRes.status).not.toBe(403)
  })

  it('write-scoped token: mcp-apply succeeds for the plan produced by a read-scoped call, audit actor is the resource owner', async () => {
    await createTargetSeed(app, db, adminToken)

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
    await createTargetSeed(app, db, adminToken)

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

  it('a 1.x schema token is refused outside the schema operations', async () => {
    const schemaToken = await issueToken(app, db, adminToken, 'schema:read schema:write', 'state-maximal')
    const auth = { Authorization: `Bearer ${schemaToken.access_token}` }

    const contentRes = await app.request(`/api/content/${SEED_SLUG}`, { headers: auth }, { ...TEST_ENV, DB: db })
    expect(contentRes.status).toBe(403)
    expect((await contentRes.json<{ error_description: string }>()).error_description).toContain('content:read')

    const settingsRes = await app.request('/api/settings', { headers: auth }, { ...TEST_ENV, DB: db })
    expect(settingsRes.status).toBe(403)
    expect((await settingsRes.json<{ error_description: string }>()).error_description).toContain('settings:read')
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
  describe('v2 scopes', () => {
    async function loginAs(email: string) {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(200)
      return (await res.json<{ token: string }>()).token
    }

    async function intentRows() {
      const { results } = await db
        .prepare('SELECT operation_id, status FROM agent_intents')
        .all<{ operation_id: string; status: string }>()
      return results
    }

    async function countArticles() {
      const row = await db.prepare(`SELECT COUNT(*) AS n FROM content_${SEED_SLUG}`).first<{ n: number }>()
      return row?.n
    }

    it('seeded clients allow every v2 scope after the migrations', async () => {
      const { results } = await db
        .prepare(`SELECT client_id, allowed_scopes FROM oauth_clients WHERE client_id IN ('beech-mcp', 'beech-mcp-cli') ORDER BY client_id`)
        .all<{ client_id: string; allowed_scopes: string }>()

      expect(results).toEqual([
        { client_id: 'beech-mcp', allowed_scopes: MCP_ALLOWED_SCOPES },
        { client_id: 'beech-mcp-cli', allowed_scopes: CLI_ALLOWED_SCOPES },
      ])
    })

    it('a content:read token reads content and is refused content writes', async () => {
      await createTargetSeed(app, db, adminToken)
      const token = await issueToken(app, db, adminToken, 'content:read', 'state-content-read')
      const auth = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }

      const readRes = await app.request(`/api/content/${SEED_SLUG}`, { headers: auth }, { ...TEST_ENV, DB: db })
      const writeRes = await app.request(`/api/content/${SEED_SLUG}`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ status: 'draft' }),
      }, { ...TEST_ENV, DB: db })

      expect(readRes.status).toBe(200)
      expect(writeRes.status).toBe(403)
      const body = await writeRes.json<{ error: string; error_description: string }>()
      expect(body.error).toBe('insufficient_scope')
      expect(body.error_description).toContain('content:write')
      expect(await countArticles()).toBe(0)
    })

    it('a production publish sent as text/plain becomes an intent and persists nothing', async () => {
      // Regression guard: the gate once read the body only for application/json, the validator for any type.
      await createTargetSeed(app, db, adminToken)
      const token = await issueToken(app, db, adminToken, 'content:read content:write', 'state-text-plain')

      const res = await app.request(`/api/content/${SEED_SLUG}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'text/plain' },
        body: JSON.stringify({ status: 'published', title: 'x' }),
      }, { ...TEST_ENV, ENV: 'production', DB: db })

      expect(res.status).toBe(202)
      expect(await countArticles()).toBe(0)
      expect(await intentRows()).toEqual([{ operation_id: 'content.create', status: 'pending' }])
    })

    it('a token wider than the owner role is still limited by RBAC', async () => {
      await createTargetSeed(app, db, adminToken)
      const scopedUser = { id: 'user_scoped_oauth', email: 'scoped-oauth@beechcms.io' }
      await seedTestUsers(db, [{ ...scopedUser, password_hash: await bcrypt.hash('password123', 10), grantSuperAdmin: false }])
      const ids = new SequentialIdGenerator()
      const roleId = await new D1RoleRepository(db, ids).create({ name: 'ArticlesReader', description: null, permissions: ['content:read'] })
      await new D1RoleAssignmentRepository(db, ids).create({ userId: scopedUser.id, roleId, scope: SEED_SLUG })
      const scopedToken = await loginAs(scopedUser.email)
      const token = await issueToken(app, db, scopedToken, CLI_SCOPES, 'state-scoped')
      const auth = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }
      const readSettings = async () => {
        const res = await app.request('/api/settings', { headers: { Authorization: `Bearer ${adminToken}` } }, { ...TEST_ENV, DB: db })
        expect(res.status).toBe(200)
        return res.json<unknown>()
      }
      const settingsBefore = await readSettings()

      const seedsRes = await app.request('/api/seeds', { headers: auth }, { ...TEST_ENV, DB: db })
      const settingsRes = await app.request('/api/settings', { method: 'PUT', headers: auth, body: '{}' }, { ...TEST_ENV, DB: db })

      expect(token.scope.split(' ').sort()).toEqual([
        'agent:read', 'analytics:read', 'automations:read', 'content:read', 'content:write', 'media:read',
        'schema:read', 'settings:read', 'settings:write',
      ])
      expect(seedsRes.status).toBe(403)
      expect((await seedsRes.json<{ error: string }>()).error).toBe('forbidden')
      expect(settingsRes.status).toBe(403)
      expect((await settingsRes.json<{ error: string }>()).error).toBe('forbidden')
      expect(await readSettings()).toEqual(settingsBefore)
      expect(await intentRows()).toEqual([])
    })

    it('a destructive call with the right scope becomes a pending intent and changes nothing', async () => {
      await createTargetSeed(app, db, adminToken)
      const token = await issueToken(app, db, adminToken, 'schema:read schema:write', 'state-destructive')

      const deleteRes = await app.request(`/api/seeds/${SEED_SLUG}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.access_token}` },
      }, { ...TEST_ENV, DB: db })
      const intactRes = await app.request(`/api/seeds/${SEED_SLUG}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }, { ...TEST_ENV, DB: db })

      expect(deleteRes.status).toBe(202)
      expect(intactRes.status).toBe(200)
      expect(await intentRows()).toEqual([{ operation_id: 'seeds.delete', status: 'pending' }])
    })

    it('an excluded operation is refused for a maximal token', async () => {
      const token = await issueToken(app, db, adminToken, CLI_SCOPES, 'state-excluded')

      const res = await app.request('/api/settings/password', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'password123', newPassword: 'changed-pass-1' }),
      }, { ...TEST_ENV, DB: db })
      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(403)
      expect((await res.json<{ error: string }>()).error).toBe('insufficient_scope')
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer error="insufficient_scope"')
      expect(loginRes.status).toBe(200)
    })
  })
})
