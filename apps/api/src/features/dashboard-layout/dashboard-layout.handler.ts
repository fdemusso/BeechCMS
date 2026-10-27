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
import { publicProblem } from '../../public/errors/problem-details'
import { zodJson, type ZodJsonInput, type ZodJsonRefusal } from '../../shared/utils/zod-json'
import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { DashboardLayout } from '@beechcms/core'
import type { AppEnv, Env, Variables } from '../../types'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>
type LayoutBodyInput = ZodJsonInput<typeof dashboardLayoutSchema>

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

/**
 * The same check as a middleware, for the PUT routes: it has to run before the body is read, so a
 * caller who may not edit gets 403 whatever they send and learns nothing about the layout contract.
 */
const requireDashboardEdit: MiddlewareHandler<AppEnv> = async (context, next) => {
  const forbidden = requireDashboardEditPermission(context)
  if (forbidden) return forbidden
  await next()
}

function invalidScopeProblem(context: AppContext, scope: string) {
  return publicProblem(context, {
    type: 'invalid-scope',
    title: 'Invalid scope',
    status: 400,
    detail: `Unknown dashboard scope '${scope}'.`,
  })
}

/** Refuses a `:scope` that is not `default` or `role:<known role>` before anything else looks at the request. */
const requireValidScope: MiddlewareHandler<AppEnv, '/:scope'> = async (context, next) => {
  const scope = context.req.param('scope')
  if (!isValidDashboardScope(scope)) return invalidScopeProblem(context, scope)
  await next()
}

/** The body of a PUT: not JSON at all is a 400, JSON that is not a layout is a 422. */
function rejectInvalidLayoutBody(context: AppContext, error: z.ZodError, cause: ZodJsonRefusal) {
  if (cause === 'malformed') {
    return publicProblem(context, {
      type: 'invalid-json',
      title: 'Invalid JSON',
      status: 400,
      detail: 'Body must be valid JSON.',
    })
  }
  return publicProblem(context, {
    type: 'invalid-layout',
    title: 'Invalid layout',
    status: 422,
    detail: error.message,
  })
}

/** Shared semantic-validate-and-upsert logic for the bare and `:scope` PUT routes. */
async function saveLayout(context: AppContext, scope: string, layout: DashboardLayout) {
  const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
  const result = validateDashboardLayout(layout, { seedSlugs })
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

  return context.json({ ok: true, layout: result.cleaned, warnings: result.warnings }, 200)
}

async function putDefaultLayout(context: Context<AppEnv, '/', LayoutBodyInput>) {
  return saveLayout(context, DEFAULT_DASHBOARD_SCOPE, context.req.valid('json'))
}

async function putScopedLayout(context: Context<AppEnv, '/:scope', LayoutBodyInput>) {
  return saveLayout(context, context.req.param('scope'), context.req.valid('json'))
}

/**
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`).
 */
const dashboardLayoutApp = new Hono<{ Bindings: Env; Variables: Variables }>()
  /**
   * Returns the dashboard layout for the caller, walking the scope chain
   * derived from their role (`role:<role>` → `default`). Returns the winning
   * scope alongside the (auto-cleaned) layout, or `{ scope: 'default', layout: null }`
   * if nothing is stored anywhere. Any authenticated user may read it.
   */
  .get('/', async (context) => {
    const role = context.get('jwtPayload')?.role
    const chain = resolveDashboardScopeChain(role)
    const repo = context.get('dashboardLayoutRepository')

    for (const scope of chain) {
      const record = await repo.get(scope)
      if (!record) continue

      const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
      const { cleaned } = validateDashboardLayout(record.layout, { seedSlugs })
      return context.json({ scope, layout: cleaned }, 200)
    }

    return context.json({ scope: DEFAULT_DASHBOARD_SCOPE, layout: null as DashboardLayout | null }, 200)
  })
  /**
   * Lists the closed set of dashboard scopes (`default` + one per known role),
   * annotated with whether each currently has a stored layout. Admin-only —
   * builder furniture for the scope switcher.
   */
  .get('/scopes', async (context) => {
    const forbidden = requireDashboardEditPermission(context)
    if (forbidden) return forbidden

    const stored = new Set(await context.get('dashboardLayoutRepository').listScopes())
    const scopes = [DEFAULT_DASHBOARD_SCOPE, ...KNOWN_DASHBOARD_ROLES.map(roleScope)]
    return context.json(scopes.map((scope) => ({ scope, stored: stored.has(scope) })), 200)
  })
  /**
   * Returns the raw stored layout for an arbitrary scope (`'default'` or
   * `'role:<role>'`), or `{ scope, layout: null }` if nothing is stored.
   * Admin-only — builder furniture for loading a scope's draft.
   */
  .get('/:scope', async (context) => {
    const forbidden = requireDashboardEditPermission(context)
    if (forbidden) return forbidden

    const scope = context.req.param('scope')
    if (!isValidDashboardScope(scope)) return invalidScopeProblem(context, scope)

    const record = await context.get('dashboardLayoutRepository').get(scope)
    if (!record) return context.json({ scope, layout: null as DashboardLayout | null }, 200)

    const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
    const { cleaned } = validateDashboardLayout(record.layout, { seedSlugs })
    return context.json({ scope, layout: cleaned }, 200)
  })
  /**
   * Upserts the dashboard layout for the default scope.
   * Admin-only. Validates Zod shape, then semantic constraints (seed
   * auto-cleanup, span sums, config size cap) before persisting.
   */
  .put('/', requireDashboardEdit, zodJson(dashboardLayoutSchema, rejectInvalidLayoutBody), putDefaultLayout)
  /**
   * Removes the stored dashboard layout for the default scope ("Reset").
   * Admin-only. The next GET regenerates the default layout client-side.
   */
  .delete('/', async (context) => {
    const forbidden = requireDashboardEditPermission(context)
    if (forbidden) return forbidden

    await context.get('dashboardLayoutRepository').remove(DEFAULT_DASHBOARD_SCOPE)
    return context.json({ ok: true }, 200)
  })
  /**
   * Upserts the dashboard layout for an arbitrary scope (`'default'` or
   * `'role:<role>'`). Admin-only, `400` problem on an unknown scope.
   */
  .put('/:scope', requireValidScope, requireDashboardEdit, zodJson(dashboardLayoutSchema, rejectInvalidLayoutBody), putScopedLayout)
  /**
   * Removes the stored dashboard layout for an arbitrary scope ("Reset").
   * Admin-only, `400` problem on an unknown scope.
   */
  .delete('/:scope', async (context) => {
    const forbidden = requireDashboardEditPermission(context)
    if (forbidden) return forbidden

    const scope = context.req.param('scope')
    if (!isValidDashboardScope(scope)) return invalidScopeProblem(context, scope)

    await context.get('dashboardLayoutRepository').remove(scope)
    return context.json({ ok: true }, 200)
  })

export { dashboardLayoutApp }
