// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { deriveCodeChallenge } from '@beechcms/core'
import { FixedClock } from '@beechcms/testing'
import { createBeechApp } from '../../src/factory'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { seedTestUsers } from '../helpers/seed-fixtures'
import { SequentialIdGenerator } from '../../src/shared/services/id-generator/sequential-id-generator'
import { D1RoleRepository } from '../../src/shared/db/repositories/d1-role.repository'
import { D1RoleAssignmentRepository } from '../../src/shared/db/repositories/d1-role-assignment.repository'
import { TEST_USERS, TEST_ENV } from '../fixtures'
import {
  CODE_VERIFIER, SEED_SLUG, createTargetSeed, issueToken, requestConsent,
} from '../helpers/oauth-flow'
import type { AgentIntentPendingResponse } from '../../src/middleware/agent-intent-gate.middleware'

const SCRIPT_SCOPES = 'schema:read schema:write content:read content:write content:delete agent:read'
const CONFIRM_SCOPES = 'agent:read agent:approve'
const MCP_CLIENT_ID = 'beech-mcp'
const TTL_PLUS_ONE_MS = 601_000

const FIXED_NOW_MS = 1_700_000_000_000

type IntentRow = { operation_id: string; status: string; result_status: number | null }
type ApproveBody = { intent: { id: string; status: string }; result: { status: number; body: unknown } }

describe('agent intents — flow (real D1)', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let clock: FixedClock
  let adminToken: string
  let scriptToken: string
  let confirmToken: string

  const env = () => ({ ...TEST_ENV, DB: db })
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

  async function intentRows(): Promise<IntentRow[]> {
    const { results } = await db
      .prepare('SELECT operation_id, status, result_status FROM agent_intents ORDER BY created_at, id')
      .all<IntentRow>()
    return results
  }

  async function activityRows(entityType: string) {
    const { results } = await db
      .prepare('SELECT action FROM activity_logs WHERE entity_type = ? ORDER BY created_at, id')
      .bind(entityType)
      .all<{ action: string }>()
    return results.map(row => row.action)
  }

  async function seedExists(): Promise<boolean> {
    const row = await db.prepare('SELECT status FROM seeds WHERE slug = ?').bind(SEED_SLUG).first<{ status: string }>()
    return row?.status === 'active'
  }

  async function deleteSeedAsAgent(): Promise<string> {
    const res = await app.request(`/api/seeds/${SEED_SLUG}`, { method: 'DELETE', headers: bearer(scriptToken) }, env())
    expect(res.status).toBe(202)
    return (await res.json<AgentIntentPendingResponse>()).intent.id
  }

  const approve = (token: string, intentId: string, body?: unknown) =>
    app.request(`/api/agent/intents/${intentId}/approve`, {
      method: 'POST',
      headers: { ...bearer(token), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env())

  const reject = (token: string, intentId: string) =>
    app.request(`/api/agent/intents/${intentId}/reject`, { method: 'POST', headers: bearer(token) }, env())

  async function login(email: string): Promise<string> {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }, env())
    expect(res.status).toBe(200)
    return (await res.json<{ token: string }>()).token
  }

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    clock = new FixedClock(FIXED_NOW_MS)
    app = createBeechApp({ seeds: [], authProviders: { clock } })
    adminToken = await login(TEST_USERS[0].email)
    await createTargetSeed(app, db, adminToken)
    scriptToken = (await issueToken(app, db, adminToken, SCRIPT_SCOPES, 'state-script')).access_token
    confirmToken = (await issueToken(app, db, adminToken, CONFIRM_SCOPES, 'state-confirm', MCP_CLIENT_ID)).access_token
  })

  it('approving with the MCP client runs the stored request once and records the outcome', async () => {
    const intentId = await deleteSeedAsAgent()

    const response = await approve(confirmToken, intentId)

    expect(response.status).toBe(200)
    const body = await response.json<ApproveBody>()
    expect(body.result.status).toBeGreaterThanOrEqual(200)
    expect(body.result.status).toBeLessThan(300)
    expect(body.intent.status).toBe('executed')
    expect(await seedExists()).toBe(false)
    const rows = await intentRows()
    expect(rows).toEqual([{ operation_id: 'seeds.delete', status: 'executed', result_status: body.result.status }])
    expect(await activityRows('intent')).toEqual(expect.arrayContaining(['create', 'authorize']))
    expect(await activityRows('intent')).toHaveLength(2)
  })

  it('approving the same intent twice runs it once', async () => {
    const intentId = await deleteSeedAsAgent()
    await approve(confirmToken, intentId)

    const second = await approve(confirmToken, intentId)

    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ type: expect.stringContaining('intent_not_pending') })
    expect((await activityRows('intent')).filter(action => action === 'authorize')).toHaveLength(1)
  })

  it('the dashboard JWT can approve an intent created by an agent', async () => {
    const intentId = await deleteSeedAsAgent()

    const response = await approve(adminToken, intentId)

    expect(response.status).toBe(200)
    expect(await seedExists()).toBe(false)
    expect((await intentRows())[0].status).toBe('executed')
  })

  it('rejecting an intent keeps the data and blocks a later approval', async () => {
    const intentId = await deleteSeedAsAgent()

    const rejected = await reject(scriptToken, intentId)
    const approved = await approve(confirmToken, intentId)

    expect(rejected.status).toBe(200)
    expect((await rejected.json<{ intent: { status: string } }>()).intent.status).toBe('rejected')
    expect(approved.status).toBe(409)
    expect(await seedExists()).toBe(true)
    expect((await intentRows())[0].status).toBe('rejected')
  })

  it('an expired intent is refused and marked expired', async () => {
    const intentId = await deleteSeedAsAgent()
    clock.advance(TTL_PLUS_ONE_MS)

    const response = await approve(confirmToken, intentId)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ type: expect.stringContaining('intent_expired') })
    expect(await seedExists()).toBe(true)
    expect((await intentRows())[0].status).toBe('expired')
  })

  it('another user\'s intent is invisible', async () => {
    const intentId = await deleteSeedAsAgent()
    const otherUser = { id: 'user_other_intents', email: 'other-intents@beechcms.io' }
    await seedTestUsers(db, [{ ...otherUser, password_hash: await bcrypt.hash('password123', 10), grantSuperAdmin: false }])
    const ids = new SequentialIdGenerator()
    const roleId = await new D1RoleRepository(db, ids).create({ name: 'SeedManager', description: null, permissions: ['manage_seeds'] })
    await new D1RoleAssignmentRepository(db, ids).create({ userId: otherUser.id, roleId, scope: '*' })
    const otherToken = await login(otherUser.email)

    const detail = await app.request(`/api/agent/intents/${intentId}`, { headers: bearer(otherToken) }, env())
    const approved = await approve(otherToken, intentId)
    const list = await app.request('/api/agent/intents', { headers: bearer(otherToken) }, env())

    expect(detail.status).toBe(404)
    expect(approved.status).toBe(404)
    expect(await list.json()).toEqual({ intents: [] })
    expect(await seedExists()).toBe(true)
    expect((await intentRows())[0].status).toBe('pending')
  })

  it('the script client can neither request nor use agent:approve', async () => {
    const intentId = await deleteSeedAsAgent()
    const codeChallenge = await deriveCodeChallenge(CODE_VERIFIER)
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'beech-mcp-cli',
      redirect_uri: 'http://127.0.0.1:8977/callback',
      scope: 'agent:approve',
      state: 'state-script-approve',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString()

    const consent = await app.request(`/oauth/authorize/request?${query}`, { headers: bearer(adminToken) }, env())
    const approved = await approve(scriptToken, intentId)

    expect(consent.status).toBe(302)
    expect(new URL(consent.headers.get('Location')!).searchParams.get('error')).toBe('invalid_scope')
    expect(approved.status).toBe(403)
    expect(await approved.json()).toMatchObject({ error: 'insufficient_scope', error_description: expect.stringContaining('agent:approve') })
    expect((await intentRows())[0].status).toBe('pending')
  })

  it('the approve body cannot change what runs', async () => {
    const intentId = await deleteSeedAsAgent()

    const response = await approve(confirmToken, intentId, { path: '/api/seeds', method: 'GET' })

    expect(response.status).toBe(200)
    expect(await seedExists()).toBe(false)
    expect(await intentRows()).toEqual([expect.objectContaining({ operation_id: 'seeds.delete', status: 'executed' })])
  })

  it('a replay re-checks RBAC and records a refusal as failed', async () => {
    const owner = { id: 'user_replay_rbac', email: 'replay-rbac@beechcms.io' }
    await seedTestUsers(db, [{ ...owner, password_hash: await bcrypt.hash('password123', 10), grantSuperAdmin: false }])
    const ids = new SequentialIdGenerator()
    const roleId = await new D1RoleRepository(db, ids).create({ name: 'SeedManager2', description: null, permissions: ['manage_seeds'] })
    const assignmentId = await new D1RoleAssignmentRepository(db, ids).create({ userId: owner.id, roleId, scope: '*' })
    const ownerJwt = await login(owner.email)
    const ownerScriptToken = (await issueToken(app, db, ownerJwt, SCRIPT_SCOPES, 'state-owner-script')).access_token
    const created = await app.request(`/api/seeds/${SEED_SLUG}`, { method: 'DELETE', headers: bearer(ownerScriptToken) }, env())
    const { intent } = await created.json<AgentIntentPendingResponse>()
    await db.prepare('DELETE FROM user_role_assignments WHERE id = ?').bind(assignmentId).run()

    const response = await approve(ownerJwt, intent.id)

    expect(response.status).toBe(200)
    expect((await response.json<ApproveBody>()).result.status).toBe(403)
    expect(await seedExists()).toBe(true)
    const row = (await intentRows()).find(candidate => candidate.operation_id === 'seeds.delete')
    expect(row).toMatchObject({ status: 'failed', result_status: 403 })
  })

  it('a purge requested through content.delete becomes an intent, a plain delete does not', async () => {
    const created = await app.request(`/api/content/${SEED_SLUG}`, {
      method: 'POST',
      headers: { ...bearer(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft', title: 'To purge' }),
    }, env())
    const { id: entryId } = await created.json<{ id: string }>()
    const second = await app.request(`/api/content/${SEED_SLUG}`, {
      method: 'POST',
      headers: { ...bearer(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft', title: 'To trash' }),
    }, env())
    const { id: trashId } = await second.json<{ id: string }>()

    const purge = await app.request(`/api/content/${SEED_SLUG}/${entryId}?purge=true`, { method: 'DELETE', headers: bearer(scriptToken) }, env())
    const plain = await app.request(`/api/content/${SEED_SLUG}/${trashId}`, { method: 'DELETE', headers: bearer(scriptToken) }, env())

    expect(purge.status).toBe(202)
    expect(plain.status).toBe(200)
    expect(await intentRows()).toEqual([expect.objectContaining({ operation_id: 'content.delete', status: 'pending' })])
  })

  it('lists only the caller\'s pending, unexpired intents', async () => {
    const first = await deleteSeedAsAgent()
    const second = await deleteSeedAsAgent()
    await reject(scriptToken, first)

    const list = await app.request('/api/agent/intents', { headers: bearer(scriptToken) }, env())

    expect(list.status).toBe(200)
    const body = await list.json<{ intents: Array<{ id: string }> }>()
    expect(body.intents.map(intent => intent.id)).toEqual([second])
  })

  it('the dashboard JWT never creates intents', async () => {
    const response = await app.request(`/api/seeds/${SEED_SLUG}`, { method: 'DELETE', headers: bearer(adminToken) }, env())

    expect(response.status).toBe(200)
    expect(await intentRows()).toEqual([])
  })
})
