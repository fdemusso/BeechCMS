// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../../types'
import { publicProblem } from '../../../public/problem-details'
import {
  createAutomationSchema,
  updateAutomationSchema,
  toggleAutomationSchema,
} from './automations.schema'

const automationsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * GET /automations?seed=<slug>
 * Returns every automation declared for the given seed, newest first.
 */
automationsApp.get('/', async (context) => {
  const seedSlug = context.req.query('seed')
  if (!seedSlug) {
    return publicProblem(context, {
      type: 'missing-seed',
      status: 400,
      title: 'Bad Request',
      detail: 'Query param `seed` is required',
    })
  }
  const repository = context.get('automationRepository')
  const automations = await repository.list(seedSlug)
  return context.json(automations)
})

/**
 * POST /automations
 * Creates a new automation. Body validated by `createAutomationSchema`.
 */
automationsApp.post('/', async (context) => {
  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return publicProblem(context, {
      type: 'invalid-json',
      status: 400,
      title: 'Bad Request',
      detail: 'Request body is not valid JSON',
    })
  }

  const parsed = createAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return publicProblem(context, {
      type: 'automation-validation-failed',
      status: 400,
      title: 'Bad Request',
      detail: parsed.error.message,
    })
  }

  const repository = context.get('automationRepository')
  const id = await repository.create({
    seed_slug: parsed.data.seed_slug,
    name: parsed.data.name,
    triggers: parsed.data.triggers,
    trigger_conditions: parsed.data.trigger_conditions ?? null,
    actions: parsed.data.actions,
  })
  return context.json({ id }, 201)
})

/**
 * GET /automations/:id
 */
automationsApp.get('/:id', async (context) => {
  const id = context.req.param('id')
  const automation = await context.get('automationRepository').findById(id)
  if (!automation) {
    return publicProblem(context, {
      type: 'automation-not-found',
      status: 404,
      title: 'Not Found',
      detail: `Automation ${id} does not exist`,
    })
  }
  return context.json(automation)
})

/**
 * PUT /automations/:id
 * Full update — partial bodies allowed; cron expression validation
 * is enforced by the triggers array schema.
 */
automationsApp.put('/:id', async (context) => {
  const id = context.req.param('id')
  const repository = context.get('automationRepository')
  const existing = await repository.findById(id)
  if (!existing) {
    return publicProblem(context, {
      type: 'automation-not-found',
      status: 404,
      title: 'Not Found',
      detail: `Automation ${id} does not exist`,
    })
  }

  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return publicProblem(context, {
      type: 'invalid-json',
      status: 400,
      title: 'Bad Request',
      detail: 'Request body is not valid JSON',
    })
  }

  const parsed = updateAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return publicProblem(context, {
      type: 'automation-validation-failed',
      status: 400,
      title: 'Bad Request',
      detail: parsed.error.message,
    })
  }

  await repository.update(id, parsed.data)
  return context.body(null, 204)
})

/**
 * PATCH /automations/:id/toggle
 * Atomic single-field flip — does not require sending the full body.
 */
automationsApp.patch('/:id/toggle', async (context) => {
  const id = context.req.param('id')
  const repository = context.get('automationRepository')
  const existing = await repository.findById(id)
  if (!existing) {
    return publicProblem(context, {
      type: 'automation-not-found',
      status: 404,
      title: 'Not Found',
      detail: `Automation ${id} does not exist`,
    })
  }

  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return publicProblem(context, {
      type: 'invalid-json',
      status: 400,
      title: 'Bad Request',
      detail: 'Request body is not valid JSON',
    })
  }

  const parsed = toggleAutomationSchema.safeParse(body)
  if (!parsed.success) {
    return publicProblem(context, {
      type: 'automation-validation-failed',
      status: 400,
      title: 'Bad Request',
      detail: parsed.error.message,
    })
  }

  await repository.toggle(id, parsed.data.enabled)
  return context.body(null, 204)
})

/**
 * DELETE /automations/:id
 */
automationsApp.delete('/:id', async (context) => {
  const id = context.req.param('id')
  const repository = context.get('automationRepository')
  const existing = await repository.findById(id)
  if (!existing) {
    return publicProblem(context, {
      type: 'automation-not-found',
      status: 404,
      title: 'Not Found',
      detail: `Automation ${id} does not exist`,
    })
  }
  await repository.delete(id)
  return context.body(null, 204)
})

export { automationsApp }
