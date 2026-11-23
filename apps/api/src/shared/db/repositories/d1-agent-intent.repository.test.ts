// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import type { NewAgentIntentInput } from '@beechcms/core'
import { D1TestDatabase } from '../../../../test/helpers/d1-test-database'
import { SequentialIdGenerator } from '../../services/id-generator/sequential-id-generator'
import { seedTestUsers } from '../../../../test/helpers/seed-fixtures'
import { D1AgentIntentRepository } from './d1-agent-intent.repository'

let db: D1TestDatabase
let repo: D1AgentIntentRepository

const OWNER_ID = 'user_owner_01'
const OTHER_ID = 'user_other_01'
const NOW = 1_700_000_000
const TTL = 600

beforeEach(async () => {
  db = new D1TestDatabase()
  repo = new D1AgentIntentRepository(db, new SequentialIdGenerator())
  await seedTestUsers(db, [
    { id: OWNER_ID, email: 'owner@beechcms.io', password_hash: 'x', grantSuperAdmin: false },
    { id: OTHER_ID, email: 'other@beechcms.io', password_hash: 'x', grantSuperAdmin: false },
  ])
})

function intentInput(overrides: Partial<NewAgentIntentInput> = {}): NewAgentIntentInput {
  return {
    userId: OWNER_ID,
    clientId: 'beech-mcp',
    operationId: 'seeds.delete',
    method: 'DELETE',
    path: '/api/seeds/articles',
    body: null,
    bodyHash: 'hash',
    risk: 'destructive',
    summary: 'Delete a seed: DELETE /api/seeds/articles',
    createdAt: NOW,
    expiresAt: NOW + TTL,
    ...overrides,
  }
}

async function statusOf(intentId: string): Promise<string | undefined> {
  const row = await db.prepare('SELECT status FROM agent_intents WHERE id = ?').bind(intentId).first<{ status: string }>()
  return row?.status
}

describe('D1AgentIntentRepository', () => {
  it('creates a pending intent that only its owner can find', async () => {
    const id = await repo.create(intentInput({ body: '{"a":1}' }))

    const found = await repo.findForUser(id, OWNER_ID)
    const foundByOther = await repo.findForUser(id, OTHER_ID)

    expect(found).toMatchObject({ id, userId: OWNER_ID, status: 'pending', body: '{"a":1}', resultStatus: null, decidedAt: null })
    expect(foundByOther).toBeNull()
  })

  it('lists only pending unexpired intents of the user, newest first, capped', async () => {
    const oldest = await repo.create(intentInput({ createdAt: NOW, expiresAt: NOW + TTL }))
    const middle = await repo.create(intentInput({ createdAt: NOW + 10, expiresAt: NOW + 10 + TTL }))
    const newest = await repo.create(intentInput({ createdAt: NOW + 20, expiresAt: NOW + 20 + TTL }))
    const rejected = await repo.create(intentInput({ createdAt: NOW + 30, expiresAt: NOW + 30 + TTL }))
    await repo.decide(rejected, OWNER_ID, 'rejected', NOW + 31)
    await repo.create(intentInput({ createdAt: NOW - 1000, expiresAt: NOW - 400 }))
    await repo.create(intentInput({ userId: OTHER_ID, createdAt: NOW + 40, expiresAt: NOW + 40 + TTL }))

    const listed = await repo.listPending(OWNER_ID, NOW + 100, 50)
    const capped = await repo.listPending(OWNER_ID, NOW + 100, 2)

    expect(listed.map(intent => intent.id)).toEqual([newest, middle, oldest])
    expect(capped.map(intent => intent.id)).toEqual([newest, middle])
  })

  it('decides a pending intent once and refuses a second decision', async () => {
    const id = await repo.create(intentInput())

    const first = await repo.decide(id, OWNER_ID, 'approved', NOW + 5)
    const second = await repo.decide(id, OWNER_ID, 'rejected', NOW + 6)

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(await repo.findForUser(id, OWNER_ID)).toMatchObject({ status: 'approved', decidedAt: NOW + 5 })
  })

  it('refuses to decide an expired intent and expires it', async () => {
    const id = await repo.create(intentInput())

    const decided = await repo.decide(id, OWNER_ID, 'approved', NOW + TTL)
    const expired = await repo.expire(id, OWNER_ID, NOW + TTL)

    expect(decided).toBe(false)
    expect(expired).toBe(true)
    expect(await statusOf(id)).toBe('expired')
  })

  it('refuses to decide another user\'s intent', async () => {
    const id = await repo.create(intentInput())

    const decided = await repo.decide(id, OTHER_ID, 'approved', NOW + 5)

    expect(decided).toBe(false)
    expect(await statusOf(id)).toBe('pending')
  })

  it('records a result only on an approved intent', async () => {
    const id = await repo.create(intentInput())

    await repo.recordResult(id, 'executed', 200, 'ignored')
    const whilePending = await repo.findForUser(id, OWNER_ID)
    await repo.decide(id, OWNER_ID, 'approved', NOW + 5)
    await repo.recordResult(id, 'executed', 200, '{"ok":true}')
    const afterApproval = await repo.findForUser(id, OWNER_ID)

    expect(whilePending).toMatchObject({ status: 'pending', resultStatus: null })
    expect(afterApproval).toMatchObject({ status: 'executed', resultStatus: 200, resultBody: '{"ok":true}' })
  })

  it('deletes the intents of a deleted user', async () => {
    const id = await repo.create(intentInput())

    await db.prepare('DELETE FROM users WHERE id = ?').bind(OWNER_ID).run()

    const row = await db.prepare('SELECT COUNT(*) AS n FROM agent_intents WHERE id = ?').bind(id).first<{ n: number }>()
    expect(row?.n).toBe(0)
  })
})
