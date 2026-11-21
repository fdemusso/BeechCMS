// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AgentEnvironment, AgentIntentRecord, AgentIntentRisk, AgentIntentStatus, OAuthScope, OperationMethod } from '@beechcms/core'

/** Most pending intents one listing returns. */
export const AGENT_INTENT_LIST_LIMIT = 50
/** Largest replay response body stored on the intent; longer bodies are cut at this many UTF-8 bytes. */
export const MAX_INTENT_RESULT_BYTES = 65_536

export const AGENT_INTENT_ERRORS = {
  NOT_FOUND: 'intent_not_found',
  EXPIRED: 'intent_expired',
  NOT_PENDING: 'intent_not_pending',
} as const

/** API shape of an intent. Never carries `bodyHash`. Times are Unix seconds. */
export interface AgentIntentView {
  id: string
  operationId: string
  method: OperationMethod
  path: string
  risk: AgentIntentRisk
  summary: string
  status: AgentIntentStatus
  clientId: string
  createdAt: number
  expiresAt: number
  decidedAt: number | null
  result: { status: number; body: unknown } | null
}

/** API shape of `GET /api/agent/session`. `clientId`/`scopes` are null for the dashboard JWT. */
export interface AgentSessionView {
  userId: string
  clientId: string | null
  scopes: OAuthScope[] | null
  environment: AgentEnvironment
  /** Whether an OAuth request of this risk becomes an intent here (`requiresConfirmation`). */
  confirmation: { publish: boolean; destructive: boolean }
  /** `seed_meta.registry_version`, the value `X-Schema-Version` carries. */
  schemaVersion: number
}

/** Detail adds the stored request body: parsed JSON when it parses, else the raw text, `null` when absent. */
export interface AgentIntentDetailView extends AgentIntentView {
  body: unknown
}

/** Parsed JSON when `text` parses, the raw text otherwise, `null` when absent. */
function parseOrRaw(text: string | null): unknown {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Maps a stored intent to its API shape (list and action responses). */
export function toIntentView(record: AgentIntentRecord): AgentIntentView {
  return {
    id: record.id,
    operationId: record.operationId,
    method: record.method,
    path: record.path,
    risk: record.risk,
    summary: record.summary,
    status: record.status,
    clientId: record.clientId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    decidedAt: record.decidedAt,
    result: record.resultStatus === null ? null : { status: record.resultStatus, body: parseOrRaw(record.resultBody) },
  }
}

/** Maps a stored intent to its detail shape, which also carries the stored request body. */
export function toIntentDetailView(record: AgentIntentRecord): AgentIntentDetailView {
  return { ...toIntentView(record), body: parseOrRaw(record.body) }
}

/** Cuts `text` to at most `maxBytes` UTF-8 bytes, dropping any partial trailing character. */
export function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= maxBytes) return text
  return new TextDecoder('utf-8').decode(bytes.slice(0, maxBytes)).replace(/�+$/, '')
}
