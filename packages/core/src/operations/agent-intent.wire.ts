// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { AgentIntentRisk } from './agent-intent.repository.js'

/** The intent an OAuth request became instead of running. `expiresAt` is Unix seconds. */
export interface AgentIntentPending {
  id: string
  operationId: string
  risk: AgentIntentRisk
  summary: string
  status: 'pending'
  expiresAt: number
}

/** Body of the gate's `202` answer. */
export interface AgentIntentPendingResponse {
  intent: AgentIntentPending
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** True iff `body` is the gate's `202` body. Never throws. */
export function isAgentIntentPendingResponse(body: unknown): body is AgentIntentPendingResponse {
  if (!isPlainObject(body) || !isPlainObject(body.intent)) return false
  const intent = body.intent
  return (
    intent.status === 'pending' &&
    isNonEmptyString(intent.id) &&
    isNonEmptyString(intent.operationId) &&
    isNonEmptyString(intent.summary) &&
    (intent.risk === 'publish' || intent.risk === 'destructive') &&
    typeof intent.expiresAt === 'number' &&
    Number.isFinite(intent.expiresAt)
  )
}
