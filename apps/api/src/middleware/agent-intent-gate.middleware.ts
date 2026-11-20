// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import {
  agentEnvironment,
  matchOperation,
  requiresConfirmation,
  resolveOperationRisk,
  type AgentIntentRisk,
} from '@beechcms/core'
import type { AppEnv } from '../types'
import { insufficientScopeResponse } from './oauth-scope.middleware'
import { logActivity } from '../shared/services/activity-log/log-activity'
import { intentPayloadHash, readIntentReplay, type IntentDispatcher } from '../shared/agent-intents/replay'

/** Lifetime of a pending intent (ROADMAP §5: 10 minutes). */
export const AGENT_INTENT_TTL_SECONDS = 600
/** Largest request body stored in an intent; above it the request is refused 413. */
export const MAX_INTENT_BODY_BYTES = 262_144

export const AGENT_INTENT_GATE_ERRORS = {
  BODY_TOO_LARGE: 'intent_body_too_large',
  REPLAY_MISMATCH: 'intent_replay_mismatch',
} as const

export interface AgentIntentGateOptions {
  /** In-process dispatcher, exposed to the approve handler as `c.get('intentDispatcher')`. */
  dispatch: IntentDispatcher
}

/** Body of the 202 answer. `expiresAt` is Unix seconds. */
export interface AgentIntentPendingResponse {
  intent: { id: string; operationId: string; risk: AgentIntentRisk; summary: string; status: 'pending'; expiresAt: number }
}

function errorResponse(status: 409 | 413, error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Parsed JSON for the risk rules; any parse error is `undefined` (the handler's validator answers malformed JSON). */
function parseJsonOrUndefined(text: string | null): unknown {
  if (text === null) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Middleware that turns risky OAuth requests into pending intents and admits approved replays.
 *
 * @remarks
 * Must be registered after `permissionMiddleware()`, so an intent is only stored for a request the user may make,
 * and before the routes. JWT requests (`oauthGrant === null`) pass untouched. For OAuth requests:
 * - an in-process replay of an approved intent is admitted only when user, payload hash and intent status match;
 * - otherwise the operation's risk is resolved; when {@link requiresConfirmation} holds for the deployment
 *   environment the request is stored and answered `202` with {@link AgentIntentPendingResponse}, never run.
 *
 * @param options - The in-process dispatcher the approve handler replays through.
 * @returns A Hono middleware handler.
 */
export function agentIntentGate(options: AgentIntentGateOptions) {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    c.set('intentDispatcher', options.dispatch)

    const grant = c.get('oauthGrant')
    if (!grant) {
      await next()
      return
    }

    const method = c.req.method
    const url = new URL(c.req.url)
    const pathWithQuery = url.pathname + url.search

    const replay = readIntentReplay(c.env)
    if (replay) {
      const bodyText = (await c.req.text()) || null
      const intent = await c.get('agentIntentRepository').findForUser(replay.intentId, replay.userId)
      const admitted =
        replay.userId === grant.userId &&
        intent?.status === 'approved' &&
        (await intentPayloadHash(method, pathWithQuery, bodyText)) === replay.payloadHash
      if (!admitted) {
        return errorResponse(409, AGENT_INTENT_GATE_ERRORS.REPLAY_MISMATCH, 'The replayed request does not match the approved intent.')
      }
      await next()
      return
    }

    const operation = matchOperation(method, c.req.path)
    if (!operation || operation.exposure === 'excluded') {
      return insufficientScopeResponse(null)
    }

    // Read regardless of Content-Type: the validator parses the body without checking the header.
    const mayNeedIntent = typeof operation.risk === 'function' || operation.risk === 'publish' || operation.risk === 'destructive'
    const bodyText = mayNeedIntent ? (await c.req.text()) || null : null

    const risk = resolveOperationRisk(operation, { query: c.req.query(), body: parseJsonOrUndefined(bodyText) })
    if (!requiresConfirmation(risk, agentEnvironment(c.env.ENV)) || (risk !== 'publish' && risk !== 'destructive')) {
      await next()
      return
    }

    if (bodyText !== null && new TextEncoder().encode(bodyText).length > MAX_INTENT_BODY_BYTES) {
      return errorResponse(413, AGENT_INTENT_GATE_ERRORS.BODY_TOO_LARGE, `The request body exceeds ${MAX_INTENT_BODY_BYTES} bytes.`)
    }

    const now = c.get('clock').nowSeconds()
    const summary = `${operation.summary}: ${method} ${pathWithQuery}`
    const expiresAt = now + AGENT_INTENT_TTL_SECONDS
    const id = await c.get('agentIntentRepository').create({
      userId: grant.userId,
      clientId: grant.clientId,
      operationId: operation.id,
      method: operation.method,
      path: pathWithQuery,
      body: bodyText,
      bodyHash: await intentPayloadHash(method, pathWithQuery, bodyText),
      risk,
      summary,
      createdAt: now,
      expiresAt,
    })

    logActivity(c, {
      action: 'create',
      entityType: 'intent',
      entityId: id,
      details: { op: 'intent', operationId: operation.id, risk, clientId: grant.clientId },
    })

    const pending: AgentIntentPendingResponse = {
      intent: { id, operationId: operation.id, risk, summary, status: 'pending', expiresAt },
    }
    return c.json(pending, 202)
  }
}
