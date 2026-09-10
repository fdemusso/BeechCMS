// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { EffectivePermissions, Permission, PermissionAssignment } from '@beechcms/core'
import { hasPermission, permissionsHeldAnywhere } from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import type { Env, Variables } from '../../types'
import { RBAC_ERRORS, type RbacErrorCode } from './constants'

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>

/** Single RFC 7807 emitter for the slice, so every refusal has the same shape. */
export function rbacProblem(
  context: AppContext,
  type: RbacErrorCode,
  status: 400 | 403 | 404 | 409 | 422 | 429,
  title: string,
  detail: string,
  headers?: Record<string, string>,
) {
  return publicProblem(context, { type, title, status, detail, headers })
}

/**
 * May the actor administer this account?
 *
 * A global `manage_users` holder may administer anyone. A scoped holder may administer
 * an account only when they hold `manage_users` on EVERY scope that account is assigned
 * to — administration (deactivation above all) is total, so partial authority over a
 * target must never be enough. An account with no assignment at all is administrable
 * only by a global holder, which keeps zero-trust accounts out of a scoped manager's
 * reach until they are deliberately assigned into that scope.
 */
export function canAdministerAccount(
  actor: EffectivePermissions,
  targetAssignments: readonly PermissionAssignment[],
): boolean {
  if (actor.global.has('manage_users')) return true
  if (targetAssignments.length === 0) return false
  return targetAssignments.every(assignment =>
    hasPermission(actor, 'manage_users', assignment.scope),
  )
}

/**
 * Whether the actor personally holds every listed permission somewhere.
 *
 * Gates role AUTHORING (a role is a global object, so it has no scope of its own):
 * an actor may never mint or edit a role carrying authority they do not hold. The
 * scope-precise anti-escalation rule stays `canGrant()`, applied at assignment time.
 */
export function holdsAll(actor: EffectivePermissions, permissions: readonly Permission[]): boolean {
  const held = permissionsHeldAnywhere(actor)
  return permissions.every(permission => held.has(permission))
}

/** Reads a JSON body, returning `undefined` when it is unparseable. */
export async function readJson(context: AppContext): Promise<unknown | undefined> {
  try {
    return await context.req.json()
  } catch {
    return undefined
  }
}
