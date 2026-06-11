// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { canEditDashboard, dashboardLayoutSchema, validateDashboardLayout } from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import type { Context } from 'hono'
import type { Env, Variables } from '../../types'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

const DEFAULT_SCOPE = 'default'

/** Returns a 403 response if the caller lacks dashboard-edit permission, otherwise undefined. */
function requireDashboardEditPermission(context: AppContext) {
  const role = context.get('jwtPayload')?.role
  if (!canEditDashboard(role)) {
    return publicProblem(context, {
      type: 'forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Dashboard layout edit requires admin role.',
    })
  }
  return undefined
}

const dashboardLayoutApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * Returns the stored dashboard layout for the default scope, auto-cleaned of
 * widgets bound to deleted seeds. Any authenticated user may read it.
 */
dashboardLayoutApp.get('/', async (context) => {
  const record = await context.get('dashboardLayoutRepository').get(DEFAULT_SCOPE)
  if (!record) return context.json({ scope: DEFAULT_SCOPE, layout: null })

  const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
  const { cleaned } = validateDashboardLayout(record.layout, { seedSlugs })
  return context.json({ scope: DEFAULT_SCOPE, layout: cleaned })
})

/**
 * Upserts the dashboard layout for the default scope.
 * Admin-only. Validates Zod shape, then semantic constraints (seed
 * auto-cleanup, span sums, config size cap) before persisting.
 */
dashboardLayoutApp.put('/', async (context) => {
  const forbidden = requireDashboardEditPermission(context)
  if (forbidden) return forbidden

  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return publicProblem(context, {
      type: 'invalid-json',
      title: 'Invalid JSON',
      status: 400,
      detail: 'Body must be valid JSON.',
    })
  }

  const parsed = dashboardLayoutSchema.safeParse(body)
  if (!parsed.success) {
    return publicProblem(context, {
      type: 'invalid-layout',
      title: 'Invalid layout',
      status: 422,
      detail: parsed.error.message,
    })
  }

  const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
  const result = validateDashboardLayout(parsed.data, { seedSlugs })
  if (!result.ok) {
    return publicProblem(context, {
      type: 'invalid-layout',
      title: 'Invalid layout',
      status: 422,
      detail: result.errors.join('; '),
    })
  }

  const userId = context.get('jwtPayload')?.sub ?? 'unknown'
  await context.get('dashboardLayoutRepository').upsert(DEFAULT_SCOPE, result.cleaned, userId)

  return context.json({ ok: true, layout: result.cleaned, warnings: result.warnings })
})

/**
 * Removes the stored dashboard layout for the default scope ("Reset").
 * Admin-only. The next GET regenerates the default layout client-side.
 */
dashboardLayoutApp.delete('/', async (context) => {
  const forbidden = requireDashboardEditPermission(context)
  if (forbidden) return forbidden

  await context.get('dashboardLayoutRepository').remove(DEFAULT_SCOPE)
  return context.json({ ok: true })
})

export { dashboardLayoutApp }
