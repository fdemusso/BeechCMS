// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import {
  canEditDashboard,
  dashboardLayoutSchema,
  validateDashboardLayout,
  isValidDashboardScope,
  resolveDashboardScopeChain,
  roleScope,
  KNOWN_DASHBOARD_ROLES,
  DEFAULT_DASHBOARD_SCOPE,
} from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import type { Context } from 'hono'
import type { DashboardLayout } from '@beechcms/core'
import type { Env, Variables } from '../../types'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

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

/** Shared validate-and-upsert logic for the bare and `:scope` PUT routes. */
async function putLayout(context: AppContext, scope: string) {
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
  await context.get('dashboardLayoutRepository').upsert(scope, result.cleaned, userId)

  return context.json({ ok: true, layout: result.cleaned, warnings: result.warnings })
}

const dashboardLayoutApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * Returns the dashboard layout for the caller, walking the scope chain
 * derived from their role (`role:<role>` → `default`). Returns the winning
 * scope alongside the (auto-cleaned) layout, or `{ scope: 'default', layout: null }`
 * if nothing is stored anywhere. Any authenticated user may read it.
 */
dashboardLayoutApp.get('/', async (context) => {
  const role = context.get('jwtPayload')?.role
  const chain = resolveDashboardScopeChain(role)
  const repo = context.get('dashboardLayoutRepository')

  for (const scope of chain) {
    const record = await repo.get(scope)
    if (!record) continue

    const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
    const { cleaned } = validateDashboardLayout(record.layout, { seedSlugs })
    return context.json({ scope, layout: cleaned })
  }

  return context.json({ scope: DEFAULT_DASHBOARD_SCOPE, layout: null as DashboardLayout | null })
})

/**
 * Lists the closed set of dashboard scopes (`default` + one per known role),
 * annotated with whether each currently has a stored layout. Admin-only —
 * builder furniture for the scope switcher.
 */
dashboardLayoutApp.get('/scopes', async (context) => {
  const forbidden = requireDashboardEditPermission(context)
  if (forbidden) return forbidden

  const stored = new Set(await context.get('dashboardLayoutRepository').listScopes())
  const scopes = [DEFAULT_DASHBOARD_SCOPE, ...KNOWN_DASHBOARD_ROLES.map(roleScope)]
  return context.json(scopes.map((scope) => ({ scope, stored: stored.has(scope) })))
})

/**
 * Returns the raw stored layout for an arbitrary scope (`'default'` or
 * `'role:<role>'`), or `{ scope, layout: null }` if nothing is stored.
 * Admin-only — builder furniture for loading a scope's draft.
 */
dashboardLayoutApp.get('/:scope', async (context) => {
  const forbidden = requireDashboardEditPermission(context)
  if (forbidden) return forbidden

  const scope = context.req.param('scope')
  if (!isValidDashboardScope(scope)) {
    return publicProblem(context, {
      type: 'invalid-scope',
      title: 'Invalid scope',
      status: 400,
      detail: `Unknown dashboard scope '${scope}'.`,
    })
  }

  const record = await context.get('dashboardLayoutRepository').get(scope)
  if (!record) return context.json({ scope, layout: null as DashboardLayout | null })

  const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
  const { cleaned } = validateDashboardLayout(record.layout, { seedSlugs })
  return context.json({ scope, layout: cleaned })
})

/**
 * Upserts the dashboard layout for the default scope.
 * Admin-only. Validates Zod shape, then semantic constraints (seed
 * auto-cleanup, span sums, config size cap) before persisting.
 */
dashboardLayoutApp.put('/', (context) => putLayout(context, DEFAULT_DASHBOARD_SCOPE))

/**
 * Removes the stored dashboard layout for the default scope ("Reset").
 * Admin-only. The next GET regenerates the default layout client-side.
 */
dashboardLayoutApp.delete('/', async (context) => {
  const forbidden = requireDashboardEditPermission(context)
  if (forbidden) return forbidden

  await context.get('dashboardLayoutRepository').remove(DEFAULT_DASHBOARD_SCOPE)
  return context.json({ ok: true })
})

/**
 * Upserts the dashboard layout for an arbitrary scope (`'default'` or
 * `'role:<role>'`). Admin-only, `400` problem on an unknown scope.
 */
dashboardLayoutApp.put('/:scope', async (context) => {
  const scope = context.req.param('scope')
  if (!isValidDashboardScope(scope)) {
    return publicProblem(context, {
      type: 'invalid-scope',
      title: 'Invalid scope',
      status: 400,
      detail: `Unknown dashboard scope '${scope}'.`,
    })
  }
  return putLayout(context, scope)
})

/**
 * Removes the stored dashboard layout for an arbitrary scope ("Reset").
 * Admin-only, `400` problem on an unknown scope.
 */
dashboardLayoutApp.delete('/:scope', async (context) => {
  const forbidden = requireDashboardEditPermission(context)
  if (forbidden) return forbidden

  const scope = context.req.param('scope')
  if (!isValidDashboardScope(scope)) {
    return publicProblem(context, {
      type: 'invalid-scope',
      title: 'Invalid scope',
      status: 400,
      detail: `Unknown dashboard scope '${scope}'.`,
    })
  }

  await context.get('dashboardLayoutRepository').remove(scope)
  return context.json({ ok: true })
})

export { dashboardLayoutApp }
