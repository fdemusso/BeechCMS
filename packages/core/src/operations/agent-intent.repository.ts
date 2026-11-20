// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OperationMethod, OperationRisk } from './types.js'

/** Risks that create an intent. */
export type AgentIntentRisk = Extract<OperationRisk, 'publish' | 'destructive'>

/** `pending` → `approved` → `executed` | `failed`; `pending` → `rejected` | `expired`. No other transition exists. */
export type AgentIntentStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired'

/** A stored agent request awaiting (or past) a human decision. */
export interface AgentIntentRecord {
  id: string
  userId: string
  clientId: string
  operationId: string
  method: OperationMethod
  /** Path including the query string, exactly as received (`/api/content/posts/e1?purge=true`). */
  path: string
  /** Raw request body text; `null` when the request had none. */
  body: string | null
  /** `intentPayloadHash(method, path, body)`. */
  bodyHash: string
  risk: AgentIntentRisk
  summary: string
  status: AgentIntentStatus
  resultStatus: number | null
  resultBody: string | null
  /** Unix seconds. */
  createdAt: number
  expiresAt: number
  decidedAt: number | null
}

/** Fields the caller supplies when storing a new intent. */
export type NewAgentIntentInput = Omit<AgentIntentRecord, 'id' | 'status' | 'resultStatus' | 'resultBody' | 'decidedAt'>

/** Storage contract for agent intents. Times are passed by the caller; the implementation mints ids. */
export interface IAgentIntentRepository {
  /** Stores a `pending` intent and returns its id. */
  create(input: NewAgentIntentInput): Promise<string>
  /** One intent of this user, any status. Null when absent OR owned by someone else (indistinguishable on purpose). */
  findForUser(intentId: string, userId: string): Promise<AgentIntentRecord | null>
  /** This user's `pending` intents with `expiresAt > now`, newest first, at most `limit`. */
  listPending(userId: string, now: number, limit: number): Promise<AgentIntentRecord[]>
  /**
   * Atomic `pending` → `approved` | `rejected`, only while `expiresAt > now` and only for this user.
   * TRUE only when THIS call performed the transition (single-use under concurrency).
   */
  decide(intentId: string, userId: string, decision: 'approved' | 'rejected', now: number): Promise<boolean>
  /** Atomic `pending` → `expired` for an intent whose `expiresAt <= now`. TRUE when it transitioned. */
  expire(intentId: string, userId: string, now: number): Promise<boolean>
  /** `approved` → `executed` | `failed` with the replay outcome. No-op on any other status. */
  recordResult(intentId: string, outcome: 'executed' | 'failed', resultStatus: number, resultBody: string | null): Promise<void>
}
