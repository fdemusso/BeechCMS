// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import {
  dashboardLayoutSchema,
  validateDashboardLayout,
  filterDashboardLayoutForViewer,
  DEFAULT_DASHBOARD_SCOPE,
} from '@beechcms/core'
import { publicProblem } from '../../public/errors/problem-details'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { zodJson, type ZodJsonInput, type ZodJsonRefusal } from '../../shared/utils/zod-json'
import type { Context } from 'hono'
import type { z } from 'zod'
import type { DashboardLayout, DashboardLayoutViewer } from '@beechcms/core'
import type { AppEnv, Env, Variables } from '../../types'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>
type LayoutBodyInput = ZodJsonInput<typeof dashboardLayoutSchema>

/** The caller as the core filter sees them: active role ids at any scope + effective authority. */
async function resolveLayoutViewer(context: AppContext): Promise<DashboardLayoutViewer> {
  const userId = context.get('jwtPayload')?.sub
  const assignments = userId ? await context.get('roleAssignmentRepository').listActiveForUser(userId) : []

  return {
    roleIds: new Set(assignments.map((assignment) => assignment.roleId)),
    permissions: await resolveEffectivePermissions(context),
  }
}

/** The stored layout, auto-cleaned against the seed registry, or null when nothing is stored. */
async function loadStoredLayout(context: AppContext): Promise<DashboardLayout | null> {
  const record = await context.get('dashboardLayoutRepository').get(DEFAULT_DASHBOARD_SCOPE)
  if (!record) return null

  const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
  return validateDashboardLayout(record.layout, { seedSlugs }).cleaned
}

/** 409 `layout-locked` when the stored layout holds widgets this caller cannot read, else undefined. */
async function refuseIfLocked(context: AppContext): Promise<Response | undefined> {
  const stored = await loadStoredLayout(context)
  if (!stored) return undefined

  const { hiddenWidgetCount } = filterDashboardLayoutForViewer(stored, await resolveLayoutViewer(context))
  if (hiddenWidgetCount === 0) return undefined

  return publicProblem(context, {
    type: 'layout-locked',
    title: 'Layout locked',
    status: 409,
    detail: 'The stored layout contains widgets on seeds you cannot read; saving or resetting it would remove them.',
  })
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

/** Semantic validation (seeds, role ids), then the lock precondition, then the upsert. */
async function putLayout(context: Context<AppEnv, '/', LayoutBodyInput>) {
  const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
  const roleIds = new Set((await context.get('roleRepository').listAll()).map((role) => role.id))
  const result = validateDashboardLayout(context.req.valid('json'), { seedSlugs, roleIds })
  if (!result.ok) {
    return publicProblem(context, {
      type: 'invalid-layout',
      title: 'Invalid layout',
      status: 422,
      detail: result.errors.join('; '),
    })
  }

  const locked = await refuseIfLocked(context)
  if (locked) return locked

  const userId = context.get('jwtPayload')?.sub ?? 'unknown'
  await context.get('dashboardLayoutRepository').upsert(DEFAULT_DASHBOARD_SCOPE, result.cleaned, userId)

  return context.json({ ok: true, layout: result.cleaned, warnings: result.warnings }, 200)
}

/**
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`).
 */
const dashboardLayoutApp = new Hono<{ Bindings: Env; Variables: Variables }>()
  /**
   * Returns the dashboard layout projected for the caller: tabs outside their role audience and
   * widgets on seeds they cannot read are removed server-side. Any authenticated user may call it;
   * `{ layout: null }` when nothing is stored. `no-store` because the body is per-caller.
   */
  .get('/', async (context) => {
    context.header('Cache-Control', 'no-store')

    const stored = await loadStoredLayout(context)
    if (!stored) return context.json({ layout: null as DashboardLayout | null }, 200)

    const { layout } = filterDashboardLayoutForViewer(stored, await resolveLayoutViewer(context))
    return context.json({ layout }, 200)
  })
  /**
   * Lists every role as `{ id, name, icon }` for the tab audience picker.
   * Gated to `manage_roles@*` by the route table.
   */
  .get('/roles', async (context) => {
    context.header('Cache-Control', 'no-store')

    const roles = await context.get('roleRepository').listAll()
    return context.json(roles.map((role) => ({ id: role.id, name: role.name, icon: role.icon ?? null })), 200)
  })
  /**
   * Upserts the dashboard layout. Gated to `manage_roles@*` by the route table; `422` on an invalid
   * layout or unknown role id, `409` when the stored layout holds widgets the caller cannot read.
   */
  .put('/', zodJson(dashboardLayoutSchema, rejectInvalidLayoutBody), putLayout)
  /**
   * Removes the stored dashboard layout ("Reset"). Gated to `manage_roles@*` by the route table;
   * `409` when the stored layout holds widgets the caller cannot read. The next GET regenerates
   * the default layout client-side.
   */
  .delete('/', async (context) => {
    const locked = await refuseIfLocked(context)
    if (locked) return locked

    await context.get('dashboardLayoutRepository').remove(DEFAULT_DASHBOARD_SCOPE)
    return context.json({ ok: true }, 200)
  })

export { dashboardLayoutApp }
