// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import { buildEffectivePermissions, type EffectivePermissions } from '@beechcms/core'
import type { Env, Variables } from '../../types'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

/** An authority of exactly nothing. Returned for callers with no active assignment. */
const EMPTY_PERMISSIONS: EffectivePermissions = { global: new Set(), byScope: new Map() }

/**
 * Resolves the caller's effective authority once per request and memoizes it in the
 * `effectivePermissions` context Variable.
 *
 * Two D1 reads on first call: the decay-filtered assignment list, then the referenced
 * roles in one round trip. Assignments naming an unknown role are dropped by the core
 * evaluator, so a torn read can only ever narrow authority, never widen it.
 *
 * Lives in `shared/` — not in a slice — because `features/oauth/authorize.ts` needs it
 * on a route that never reaches `permissionMiddleware()`, and a slice-to-slice import
 * would violate VSA.
 */
export async function resolveEffectivePermissions(context: AppContext): Promise<EffectivePermissions> {
  const cached = context.get('effectivePermissions')
  if (cached) return cached

  const userId = context.get('jwtPayload')?.sub
  if (!userId) return EMPTY_PERMISSIONS

  const assignments = await context.get('roleAssignmentRepository').listActiveForUser(userId)
  if (assignments.length === 0) {
    context.set('effectivePermissions', EMPTY_PERMISSIONS)
    return EMPTY_PERMISSIONS
  }

  const roleIds = [...new Set(assignments.map(assignment => assignment.roleId))]
  const roles = await context.get('roleRepository').findByIds(roleIds)
  const effective = buildEffectivePermissions(assignments, roles)

  context.set('effectivePermissions', effective)
  return effective
}
