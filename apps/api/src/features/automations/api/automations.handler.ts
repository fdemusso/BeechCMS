// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { AppEnv, Env, Variables } from '../../../types'
import { publicProblem } from '../../../public/errors/problem-details'
import { zodJson, type ZodJsonRefusal } from '../../../shared/utils/zod-json'
import { zodQuery } from '../../../shared/utils/zod-query'
import {
  createAutomationSchema,
  listAutomationsQuerySchema,
  updateAutomationSchema,
  toggleAutomationSchema,
} from './automations.schema'

function rejectMissingSeed(context: Context<AppEnv>) {
  return publicProblem(context, {
    type: 'missing-seed',
    status: 400,
    title: 'Bad Request',
    detail: 'Query param `seed` is required',
  })
}

/** Both refusals are a 400; the `type` tells a body that is not JSON from JSON the schema rejects. */
function rejectInvalidAutomationBody(context: Context<AppEnv>, error: z.ZodError, cause: ZodJsonRefusal) {
  if (cause === 'malformed') {
    return publicProblem(context, {
      type: 'invalid-json',
      status: 400,
      title: 'Bad Request',
      detail: 'Request body is not valid JSON',
    })
  }
  return publicProblem(context, {
    type: 'automation-validation-failed',
    status: 400,
    title: 'Bad Request',
    detail: error.message,
  })
}

function automationNotFound(context: Context<AppEnv>, id: string) {
  return publicProblem(context, {
    type: 'automation-not-found',
    status: 404,
    title: 'Not Found',
    detail: `Automation ${id} does not exist`,
  })
}

/**
 * Answers 404 for an unknown `:id` before the body is read, so a request for an automation that
 * does not exist is a 404 whatever it carries.
 */
const requireAutomation: MiddlewareHandler<AppEnv, '/:id' | '/:id/toggle'> = async (context, next) => {
  const id = context.req.param('id')
  const existing = await context.get('automationRepository').findById(id)
  if (!existing) return automationNotFound(context, id)
  await next()
}

/**
 * Registered as one method chain so the route types reach `AppType` (see `../../../routes.ts`).
 */
const automationsApp = new Hono<{ Bindings: Env; Variables: Variables }>()
  /**
   * GET /automations?seed=<slug>
   * Returns every automation declared for the given seed, newest first.
   */
  .get('/', zodQuery(listAutomationsQuerySchema, rejectMissingSeed), async (context) => {
    const { seed } = context.req.valid('query')
    const automations = await context.get('automationRepository').list(seed)
    return context.json(automations, 200)
  })
  /**
   * POST /automations
   * Creates a new automation. Body validated by `createAutomationSchema`.
   */
  .post('/', zodJson(createAutomationSchema, rejectInvalidAutomationBody), async (context) => {
    const body = context.req.valid('json')
    const id = await context.get('automationRepository').create({
      seed_slug: body.seed_slug,
      name: body.name,
      triggers: body.triggers,
      trigger_conditions: body.trigger_conditions ?? null,
      actions: body.actions,
    })
    return context.json({ id }, 201)
  })
  /**
   * GET /automations/:id
   */
  .get('/:id', async (context) => {
    const id = context.req.param('id')
    const automation = await context.get('automationRepository').findById(id)
    if (!automation) return automationNotFound(context, id)
    return context.json(automation, 200)
  })
  /**
   * PUT /automations/:id
   * Full update — partial bodies allowed; cron expression validation
   * is enforced by the triggers array schema.
   */
  .put('/:id', requireAutomation, zodJson(updateAutomationSchema, rejectInvalidAutomationBody), async (context) => {
    await context.get('automationRepository').update(context.req.param('id'), context.req.valid('json'))
    return context.body(null, 204)
  })
  /**
   * PATCH /automations/:id/toggle
   * Atomic single-field flip — does not require sending the full body.
   */
  .patch('/:id/toggle', requireAutomation, zodJson(toggleAutomationSchema, rejectInvalidAutomationBody), async (context) => {
    await context.get('automationRepository').toggle(context.req.param('id'), context.req.valid('json').enabled)
    return context.body(null, 204)
  })
  /**
   * DELETE /automations/:id
   */
  .delete('/:id', requireAutomation, async (context) => {
    await context.get('automationRepository').delete(context.req.param('id'))
    return context.body(null, 204)
  })

export { automationsApp }
