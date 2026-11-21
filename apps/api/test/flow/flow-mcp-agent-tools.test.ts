// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * MCP agent tools — flow tier (real createBeechApp, D1TestDatabase, real OAuth tokens).
 * Runs the decision logic of `beech_whoami`, `beech_intents` and `beech_confirm` over the in-process API.
 * The elicitation dialog is a recorder; its transport through the MCP SDK is covered by the MCP integration test.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { FixedClock } from '@beechcms/testing'
import { createBeechApp } from '../../src/factory'
import { MCP_OAUTH_SCOPE, MCP_OAUTH_SCOPES, PENDING_ACTIONS_PATH } from '../../../../packages/mcp/src/constants'
import {
  beechConfirm, beechIntents, beechWhoami,
  type AgentToolDeps, type ElicitOutcome,
} from '../../../../packages/mcp/src/agent-tools'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { seedTestUsers } from '../helpers/seed-fixtures'
import { SequentialIdGenerator } from '../../src/shared/services/id-generator/sequential-id-generator'
import { D1RoleRepository } from '../../src/shared/db/repositories/d1-role.repository'
import { D1RoleAssignmentRepository } from '../../src/shared/db/repositories/d1-role-assignment.repository'
import { CLI_SCOPES, SEED_SLUG, createTargetSeed, issueToken } from '../helpers/oauth-flow'
import { TEST_USERS, TEST_ENV } from '../fixtures'
import type { AgentIntentPendingResponse } from '../../src/middleware/agent-intent-gate.middleware'

const FIXED_NOW_MS = 1_700_000_000_000
const API_URL = 'http://localhost:8789'
const TTL_PLUS_ONE_MS = 601_000

type IntentStatusRow = { status: string }

describe('MCP agent tools — flow (real D1)', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let clock: FixedClock
  let adminToken: string
  let scriptToken: string
  let mcpToken: string
  let dialogMessages: string[]

  const env = () => ({ ...TEST_ENV, DB: db })
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

  /** Deps over the in-process app, authenticated as the MCP client of `token`. */
  function depsFor(token: string, elicitOutcome: ElicitOutcome): AgentToolDeps {
    return {
      async send(method, path, body) {
        return app.request(path, {
          method,
          headers: { ...bearer(token), 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }, env())
      },
      async elicit(message) {
        dialogMessages.push(message)
        return elicitOutcome
      },
      nowSeconds: () => clock.nowSeconds(),
      apiUrl: API_URL,
      pendingActionsUrl: `${API_URL}${PENDING_ACTIONS_PATH}`,
      scriptScopes: () => CLI_SCOPES.split(' '),
    }
  }

  async function login(email: string): Promise<string> {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }, env())
    expect(res.status).toBe(200)
    return (await res.json<{ token: string }>()).token
  }

  async function deleteSeedAsAgent(token = scriptToken): Promise<string> {
    const res = await app.request(`/api/seeds/${SEED_SLUG}`, { method: 'DELETE', headers: bearer(token) }, env())
    expect(res.status).toBe(202)
    return (await res.json<AgentIntentPendingResponse>()).intent.id
  }

  async function seedExists(): Promise<boolean> {
    const row = await db.prepare('SELECT status FROM seeds WHERE slug = ?').bind(SEED_SLUG).first<{ status: string }>()
    return row?.status === 'active'
  }

  async function intentStatus(intentId: string): Promise<string | undefined> {
    const row = await db.prepare('SELECT status FROM agent_intents WHERE id = ?').bind(intentId).first<IntentStatusRow>()
    return row?.status
  }

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    clock = new FixedClock(FIXED_NOW_MS)
    dialogMessages = []
    app = createBeechApp({ seeds: [], authProviders: { clock } })
    adminToken = await login(TEST_USERS[0].email)
    await createTargetSeed(app, db, adminToken)
    scriptToken = (await issueToken(app, db, adminToken, CLI_SCOPES, 'state-script')).access_token
    mcpToken = (await issueToken(app, db, adminToken, MCP_OAUTH_SCOPE, 'state-mcp', 'beech-mcp')).access_token
  })

  it('whoami reports the admin, the MCP scopes and the development policy', async () => {
    const deps = depsFor(mcpToken, { action: 'unsupported' })

    const result = await beechWhoami(deps)

    expect(result.user.email).toBe(TEST_USERS[0].email)
    expect([...(result.mcp.scopes ?? [])].sort()).toEqual([...MCP_OAUTH_SCOPES].sort())
    expect(result.scripts.scopes).toEqual(CLI_SCOPES.split(' '))
    expect(result.confirmation.destructive).toBe(true)
  })

  it('intents lists the intent a script created for the same user', async () => {
    await deleteSeedAsAgent()
    const deps = depsFor(mcpToken, { action: 'unsupported' })

    const result = await beechIntents(deps)

    expect(result.intents).toHaveLength(1)
    expect(result.intents[0]).toMatchObject({ operationId: 'seeds.delete', risk: 'destructive', expiresInSeconds: 600 })
  })

  it('confirm with approve runs the intent once and deletes the seed', async () => {
    const intentId = await deleteSeedAsAgent()
    const deps = depsFor(mcpToken, { action: 'accept', decision: 'approve' })

    const result = await beechConfirm({ intentIds: [intentId] }, deps)

    expect(result.status).toBe('decided')
    expect(result.results[0].outcome).toBe('executed')
    expect(result.results[0].resultStatus).toBeLessThan(400)
    expect(dialogMessages[0]).toContain(result.results[0].summary)
    expect(await seedExists()).toBe(false)
    expect(await intentStatus(intentId)).toBe('executed')
  })

  it('confirm with reject discards the intent and keeps the seed', async () => {
    const intentId = await deleteSeedAsAgent()
    const deps = depsFor(mcpToken, { action: 'accept', decision: 'reject' })

    const result = await beechConfirm({ intentIds: [intentId] }, deps)

    expect(result.results[0].outcome).toBe('rejected')
    expect(await seedExists()).toBe(true)
    expect(await intentStatus(intentId)).toBe('rejected')
  })

  it('a declined dialog runs nothing and leaves the intent pending', async () => {
    const intentId = await deleteSeedAsAgent()
    const deps = depsFor(mcpToken, { action: 'decline' })

    const result = await beechConfirm({ intentIds: [intentId] }, deps)

    expect(result.status).toBe('declined')
    expect(result.results[0].outcome).toBe('pending')
    expect(result.instruction).toContain(deps.pendingActionsUrl)
    expect(await seedExists()).toBe(true)
    expect(await intentStatus(intentId)).toBe('pending')
  })

  it('a client without elicitation gets the dashboard fallback', async () => {
    const intentId = await deleteSeedAsAgent()
    const deps = depsFor(mcpToken, { action: 'unsupported' })

    const result = await beechConfirm({ intentIds: [intentId] }, deps)

    expect(result.status).toBe('fallback')
    expect(result.reason).toBe('elicitation_unsupported')
    expect(await seedExists()).toBe(true)
    expect(await intentStatus(intentId)).toBe('pending')
  })

  it('an expired intent is reported without opening a dialog', async () => {
    const intentId = await deleteSeedAsAgent()
    clock.advance(TTL_PLUS_ONE_MS)
    const deps = depsFor(mcpToken, { action: 'accept', decision: 'approve' })

    const result = await beechConfirm({ intentIds: [intentId] }, deps)

    expect(result.status).toBe('nothing_pending')
    expect(result.results[0].outcome).toBe('expired')
    expect(dialogMessages).toEqual([])
    expect(await seedExists()).toBe(true)
  })

  it('another user\'s intent id is not found and nothing runs', async () => {
    const intentId = await deleteSeedAsAgent()
    const otherUser = { id: 'user_other_mcp_tools', email: 'other-mcp-tools@beechcms.io' }
    await seedTestUsers(db, [{ ...otherUser, password_hash: await bcrypt.hash('password123', 10), grantSuperAdmin: false }])
    const ids = new SequentialIdGenerator()
    const roleId = await new D1RoleRepository(db, ids).create({ name: 'SeedManager', description: null, permissions: ['manage_seeds'] })
    await new D1RoleAssignmentRepository(db, ids).create({ userId: otherUser.id, roleId, scope: '*' })
    const otherJwt = await login(otherUser.email)
    const otherMcpToken = (await issueToken(app, db, otherJwt, MCP_OAUTH_SCOPE, 'state-other-mcp', 'beech-mcp')).access_token
    const deps = depsFor(otherMcpToken, { action: 'accept', decision: 'approve' })

    const result = await beechConfirm({ intentIds: [intentId] }, deps)

    expect(result.results[0].outcome).toBe('not_found')
    expect(dialogMessages).toEqual([])
    expect(await seedExists()).toBe(true)
    expect(await intentStatus(intentId)).toBe('pending')
  })
})
