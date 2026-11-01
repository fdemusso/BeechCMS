// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import {
  dashboardLayoutSchema,
  validateDashboardLayout,
  filterDashboardLayoutForViewer,
  hasDashboardLayoutStructuralChange,
  reconcileLockedWidgets,
  hasPermission,
  DEFAULT_DASHBOARD_SCOPE,
  GLOBAL_SCOPE,
} from '@beechcms/core'
import { publicProblem } from '../../public/errors/problem-details'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { resolveIfMatch } from '../../shared/utils/occ'
import { zodJson, type ZodJsonInput, type ZodJsonRefusal } from '../../shared/utils/zod-json'
import type { Context } from 'hono'
import type { z } from 'zod'
import type { DashboardLayout, DashboardLayoutViewer } from '@beechcms/core'
import type { AppEnv, Env, Variables } from '../../types'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>
type LayoutBodyInput = ZodJsonInput<typeof dashboardLayoutSchema>

/** The stored layout with its version: the `updatedAt` a client echoes back as its precondition. */
interface StoredLayoutRecord {
  readonly layout: DashboardLayout
  readonly updatedAt: number
}

/** The caller as the core filter sees them: active role ids at any scope + effective authority. */
async function resolveLayoutViewer(context: AppContext): Promise<DashboardLayoutViewer> {
  const userId = context.get('jwtPayload')?.sub
  const assignments = userId ? await context.get('roleAssignmentRepository').listActiveForUser(userId) : []

  return {
    roleIds: new Set(assignments.map((assignment) => assignment.roleId)),
    permissions: await resolveEffectivePermissions(context),
  }
}

/** The stored layout, auto-cleaned against the seed registry, with its version; null when nothing is stored. */
async function loadStoredRecord(context: AppContext): Promise<StoredLayoutRecord | null> {
  const record = await context.get('dashboardLayoutRepository').get(DEFAULT_DASHBOARD_SCOPE)
  if (!record) return null

  const seedSlugs = new Set(context.get('seedRegistry').all().map((seed) => seed.slug))
  return { layout: validateDashboardLayout(record.layout, { seedSlugs }).cleaned, updatedAt: record.updatedAt }
}

/**
 * The version the client expects to overwrite: a number from `If-Match`, `null` from `If-None-Match: *`
 * (nothing stored), `undefined` when the request carries neither. `If-Match` wins when both are present.
 */
function readLayoutPrecondition(context: AppContext): number | null | undefined {
  const ifMatch = resolveIfMatch(context, {})
  if (ifMatch !== undefined) return ifMatch
  return context.req.header('If-None-Match')?.trim() === '*' ? null : undefined
}

function preconditionRequiredProblem(context: AppContext) {
  return publicProblem(context, {
    type: 'precondition-required',
    title: 'Precondition required',
    status: 428,
    detail: 'Send If-Match with the layout version you loaded, or If-None-Match: * when nothing is stored.',
  })
}

function layoutConflictProblem(context: AppContext) {
  return publicProblem(context, {
    type: 'layout-conflict',
    title: 'Layout conflict',
    status: 409,
    detail: 'The dashboard layout was changed by someone else since you loaded it. Reload it and apply your changes again.',
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

/**
 * Gate, precondition, semantic validation, version check, structural gate, locked-widget
 * reconciliation, then the conditional write. Steps before the write never persist anything.
 */
async function putLayout(context: Context<AppEnv, '/', LayoutBodyInput>) {
  const viewer = await resolveLayoutViewer(context)
  const canStructure = hasPermission(viewer.permissions, 'manage_roles', GLOBAL_SCOPE)
  const canContent = hasPermission(viewer.permissions, 'manage_layout', GLOBAL_SCOPE)
  if (!canStructure && !canContent) {
    return publicProblem(context, {
      type: 'layout-edit-forbidden',
      title: 'Layout edit forbidden',
      status: 403,
      detail: 'Editing the dashboard layout requires manage_layout or manage_roles on all seeds.',
    })
  }

  const precondition = readLayoutPrecondition(context)
  if (precondition === undefined) return preconditionRequiredProblem(context)

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

  const stored = await loadStoredRecord(context)
  if ((stored?.updatedAt ?? null) !== precondition) return layoutConflictProblem(context)

  if (!canStructure && hasDashboardLayoutStructuralChange(stored?.layout ?? null, result.cleaned)) {
    return publicProblem(context, {
      type: 'layout-structure-forbidden',
      title: 'Layout structure forbidden',
      status: 403,
      detail: 'Adding, removing, reordering or editing tabs requires manage_roles on all seeds.',
    })
  }

  const reconciled = reconcileLockedWidgets(stored?.layout ?? null, result.cleaned, viewer.permissions)
  if (!reconciled.ok) {
    return publicProblem(context, {
      type: 'invalid-layout',
      title: 'Invalid layout',
      status: 422,
      detail: reconciled.errors.join('; '),
    })
  }

  const userId = context.get('jwtPayload')?.sub ?? 'unknown'
  const written = await context
    .get('dashboardLayoutRepository')
    .save(DEFAULT_DASHBOARD_SCOPE, reconciled.layout, userId, precondition)
  if (!written.ok) return layoutConflictProblem(context)

  // Projected, never the raw layout: it holds the re-injected locked widgets.
  const { layout } = filterDashboardLayoutForViewer(reconciled.layout, viewer)
  return context.json({ ok: true, layout, warnings: result.warnings, updatedAt: written.updatedAt }, 200)
}

/**
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`).
 */
const dashboardLayoutApp = new Hono<{ Bindings: Env; Variables: Variables }>()
  /**
   * Returns the dashboard layout projected for the caller, with the `updatedAt` version to echo back
   * as `If-Match`. Tabs outside their role audience are removed server-side; widgets they cannot use are
   * removed for readers and replaced by opaque placeholders for layout editors. Any authenticated user
   * may call it; `{ layout: null, updatedAt: null }` when nothing is stored. `no-store` because the body
   * is per-caller.
   */
  .get('/', async (context) => {
    context.header('Cache-Control', 'no-store')

    const stored = await loadStoredRecord(context)
    if (!stored) return context.json({ layout: null as DashboardLayout | null, updatedAt: null as number | null }, 200)

    const { layout } = filterDashboardLayoutForViewer(stored.layout, await resolveLayoutViewer(context))
    return context.json({ layout: layout as DashboardLayout | null, updatedAt: stored.updatedAt as number | null }, 200)
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
   * Replaces the dashboard layout. The route table admits holders of `manage_layout` or `manage_roles`
   * on any scope; the handler requires one of them at `*`. `manage_layout` alone edits tab content only.
   * `428` without `If-Match` / `If-None-Match: *`, `409` when the stored version differs, `403` when
   * the caller may not edit or may not change the structure, `422` on an invalid layout or a locked-widget
   * violation.
   */
  .put('/', zodJson(dashboardLayoutSchema, rejectInvalidLayoutBody), putLayout)
  /**
   * Removes the stored dashboard layout ("Reset"), structural and so gated to `manage_roles@*` by the
   * route table. `428` without a precondition, `409` when the stored version differs. The next GET
   * regenerates the default layout client-side.
   */
  .delete('/', async (context) => {
    const precondition = readLayoutPrecondition(context)
    if (precondition === undefined) return preconditionRequiredProblem(context)

    const removed = await context.get('dashboardLayoutRepository').remove(DEFAULT_DASHBOARD_SCOPE, precondition)
    if (!removed.ok) return layoutConflictProblem(context)

    return context.json({ ok: true }, 200)
  })

export { dashboardLayoutApp }
