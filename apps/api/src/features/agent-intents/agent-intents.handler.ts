// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono, type ExecutionContext } from 'hono'
import { OPERATION_CATALOG, agentEnvironment, requiresConfirmation } from '@beechcms/core'
import type { AppEnv } from '../../types'
import { publicProblem } from '../../public/errors/problem-details'
import { logActivity } from '../../shared/services/activity-log/log-activity'
import { withIntentReplay } from '../../shared/agent-intents/replay'
import {
  AGENT_INTENT_ERRORS,
  AGENT_INTENT_LIST_LIMIT,
  MAX_INTENT_RESULT_BYTES,
  type AgentSessionView,
  toIntentDetailView,
  toIntentView,
  truncateUtf8,
} from './agent-intents.view'

/** Status answered as the replay result when the intent's operation left the catalog. */
const OPERATION_GONE_STATUS = 410

/**
 * Agent intents feature handler.
 *
 * Lists, reads, approves and rejects the caller's own intents. Approving replays the STORED request
 * in-process through the whole app, so auth, RBAC and the intent gate run again as for the original call.
 *
 * Registered as one method chain so `AppType` carries the response types to the dashboard.
 */
const agentIntentsApp = new Hono<AppEnv>()
  /** GET /session: the caller's client, frozen scopes, environment, confirmation policy and schema version. */
  .get('/session', async (c) => {
    const grant = c.get('oauthGrant')
    const environment = agentEnvironment(c.env.ENV)
    const view: AgentSessionView = {
      userId: c.get('jwtPayload').sub,
      clientId: grant?.clientId ?? null,
      scopes: grant?.scope ?? null,
      environment,
      confirmation: {
        publish: requiresConfirmation('publish', environment),
        destructive: requiresConfirmation('destructive', environment),
      },
      schemaVersion: await c.get('seedRepository').getRegistryVersion(),
    }
    return c.json(view, 200)
  })
  /** GET /intents: the caller's pending, unexpired intents, newest first. */
  .get('/intents', async (c) => {
    const records = await c.get('agentIntentRepository').listPending(
      c.get('jwtPayload').sub,
      c.get('clock').nowSeconds(),
      AGENT_INTENT_LIST_LIMIT,
    )
    return c.json({ intents: records.map(toIntentView) }, 200)
  })
  /** GET /intents/:id: one intent of the caller, with its stored request body. */
  .get('/intents/:id', async (c) => {
    const record = await c.get('agentIntentRepository').findForUser(c.req.param('id'), c.get('jwtPayload').sub)
    if (!record) {
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.NOT_FOUND, title: 'Not Found', status: 404, detail: 'Intent not found.' })
    }
    return c.json({ intent: toIntentDetailView(record) }, 200)
  })
  /** POST /intents/:id/approve: runs the stored request once, as its owner. The request body is ignored. */
  .post('/intents/:id/approve', async (c) => {
    const intentId = c.req.param('id')
    const userId = c.get('jwtPayload').sub
    const repository = c.get('agentIntentRepository')
    const now = c.get('clock').nowSeconds()

    const intent = await repository.findForUser(intentId, userId)
    if (!intent) {
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.NOT_FOUND, title: 'Not Found', status: 404, detail: 'Intent not found.' })
    }
    if (intent.status === 'pending' && intent.expiresAt <= now) {
      await repository.expire(intentId, userId, now)
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.EXPIRED, title: 'Conflict', status: 409, detail: 'Intent has expired.' })
    }
    if (!(await repository.decide(intentId, userId, 'approved', now))) {
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.NOT_PENDING, title: 'Conflict', status: 409, detail: 'Intent is not pending.' })
    }

    const operation = OPERATION_CATALOG.find(candidate => candidate.id === intent.operationId)
    let resultStatus = OPERATION_GONE_STATUS
    let resultBody: string | null = null
    if (operation?.exposure === 'agent') {
      const request = new Request(new URL(intent.path, c.req.url), {
        method: intent.method,
        headers: intent.body ? { 'Content-Type': 'application/json' } : {},
        body: intent.body ?? undefined,
      })
      const replayEnv = withIntentReplay(c.env, {
        intentId,
        userId,
        clientId: intent.clientId,
        scope: [operation.scope],
        payloadHash: intent.bodyHash,
      })
      let executionCtx: ExecutionContext | undefined
      try { executionCtx = c.executionCtx } catch { /* absent outside the Workers runtime */ }

      const response = await c.get('intentDispatcher')(request, replayEnv, executionCtx)
      resultStatus = response.status
      resultBody = truncateUtf8(await response.text(), MAX_INTENT_RESULT_BYTES) || null
    }

    await repository.recordResult(intentId, resultStatus < 400 ? 'executed' : 'failed', resultStatus, resultBody)
    logActivity(c, {
      action: 'authorize',
      entityType: 'intent',
      entityId: intentId,
      details: { op: 'approve', operationId: intent.operationId, resultStatus },
    })

    const updated = await repository.findForUser(intentId, userId)
    if (!updated) {
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.NOT_FOUND, title: 'Not Found', status: 404, detail: 'Intent not found.' })
    }
    const view = toIntentView(updated)
    return c.json({ intent: view, result: view.result ?? { status: resultStatus, body: null } }, 200)
  })
  /** POST /intents/:id/reject: discards a pending intent without running it. */
  .post('/intents/:id/reject', async (c) => {
    const intentId = c.req.param('id')
    const userId = c.get('jwtPayload').sub
    const repository = c.get('agentIntentRepository')
    const now = c.get('clock').nowSeconds()

    const intent = await repository.findForUser(intentId, userId)
    if (!intent) {
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.NOT_FOUND, title: 'Not Found', status: 404, detail: 'Intent not found.' })
    }
    if (intent.status === 'pending' && intent.expiresAt <= now) {
      await repository.expire(intentId, userId, now)
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.EXPIRED, title: 'Conflict', status: 409, detail: 'Intent has expired.' })
    }
    if (!(await repository.decide(intentId, userId, 'rejected', now))) {
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.NOT_PENDING, title: 'Conflict', status: 409, detail: 'Intent is not pending.' })
    }

    logActivity(c, {
      action: 'revoke',
      entityType: 'intent',
      entityId: intentId,
      details: { op: 'reject', operationId: intent.operationId },
    })

    const updated = await repository.findForUser(intentId, userId)
    if (!updated) {
      return publicProblem(c, { type: AGENT_INTENT_ERRORS.NOT_FOUND, title: 'Not Found', status: 404, detail: 'Intent not found.' })
    }
    return c.json({ intent: toIntentView(updated) }, 200)
  })

export { agentIntentsApp }
