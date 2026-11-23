// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IAgentIntentRepository,
  AgentIntentRecord,
  AgentIntentRisk,
  AgentIntentStatus,
  NewAgentIntentInput,
  OperationMethod,
  IIdGenerator,
} from '@beechcms/core'

type AgentIntentRow = {
  id: string
  user_id: string
  client_id: string
  operation_id: string
  method: string
  path: string
  body: string | null
  body_hash: string
  risk: string
  summary: string
  status: string
  result_status: number | null
  result_body: string | null
  created_at: number
  expires_at: number
  decided_at: number | null
}

const METHODS: readonly OperationMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const RISKS: readonly AgentIntentRisk[] = ['publish', 'destructive']
const STATUSES: readonly AgentIntentStatus[] = ['pending', 'approved', 'rejected', 'executed', 'failed', 'expired']

/** Narrows a stored string to its union; an unexpected value throws instead of being cast. */
function narrow<T extends string>(allowed: readonly T[], value: string, column: string): T {
  const match = allowed.find(candidate => candidate === value)
  if (match === undefined) throw new Error(`agent_intents.${column} holds an unexpected value: ${value}`)
  return match
}

function rowToRecord(row: AgentIntentRow): AgentIntentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    operationId: row.operation_id,
    method: narrow(METHODS, row.method, 'method'),
    path: row.path,
    body: row.body,
    bodyHash: row.body_hash,
    risk: narrow(RISKS, row.risk, 'risk'),
    summary: row.summary,
    status: narrow(STATUSES, row.status, 'status'),
    resultStatus: row.result_status,
    resultBody: row.result_body,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
  }
}

/**
 * D1-backed agent intent storage.
 *
 * A system table: no Branch, no `br_XX`, never routed through `apiToDb`/`dbToApi`,
 * and NOT a `BaseD1Repository` (that base is content-tier). Same split as `D1InvitationRepository`.
 * State transitions are single conditional `UPDATE`s, so a decision happens at most once.
 */
export class D1AgentIntentRepository implements IAgentIntentRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async create(input: NewAgentIntentInput): Promise<string> {
    const id = this.idGenerator.uuid()
    await this.db
      .prepare(
        `INSERT INTO agent_intents
           (id, user_id, client_id, operation_id, method, path, body, body_hash, risk, summary, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .bind(
        id, input.userId, input.clientId, input.operationId, input.method, input.path,
        input.body, input.bodyHash, input.risk, input.summary, input.createdAt, input.expiresAt,
      )
      .run()
    return id
  }

  async findForUser(intentId: string, userId: string): Promise<AgentIntentRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM agent_intents WHERE id = ? AND user_id = ?')
      .bind(intentId, userId)
      .first<AgentIntentRow>()
    return row ? rowToRecord(row) : null
  }

  async listPending(userId: string, now: number, limit: number): Promise<AgentIntentRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM agent_intents
         WHERE user_id = ? AND status = 'pending' AND expires_at > ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      )
      .bind(userId, now, limit)
      .all<AgentIntentRow>()
    return results.map(rowToRecord)
  }

  async decide(intentId: string, userId: string, decision: 'approved' | 'rejected', now: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE agent_intents SET status = ?, decided_at = ?
         WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?`
      )
      .bind(decision, now, intentId, userId, now)
      .run()
    return result.meta.changes === 1
  }

  async expire(intentId: string, userId: string, now: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE agent_intents SET status = 'expired', decided_at = ?
         WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at <= ?`
      )
      .bind(now, intentId, userId, now)
      .run()
    return result.meta.changes === 1
  }

  async recordResult(
    intentId: string,
    outcome: 'executed' | 'failed',
    resultStatus: number,
    resultBody: string | null,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE agent_intents SET status = ?, result_status = ?, result_body = ?
         WHERE id = ? AND status = 'approved'`
      )
      .bind(outcome, resultStatus, resultBody, intentId)
      .run()
  }
}
