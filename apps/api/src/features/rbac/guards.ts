// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { EffectivePermissions, PageRequest, Permission, PermissionAssignment } from '@beechcms/core'
import { MAX_PAGE_SIZE, canGrant, hasPermission, permissionsHeldAnywhere } from '@beechcms/core'
import { publicProblem } from '../../public/errors/problem-details'
import type { ZodJsonInput, ZodJsonRefusal } from '../../shared/utils/zod-json'
import type { ZodQueryInput } from '../../shared/utils/zod-query'
import type { AppEnv, Env, Variables } from '../../types'
import { RBAC_ERRORS, type RbacErrorCode } from './constants'
import type { pageQuerySchema } from './rbac.schema'

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>

/** A handler's context once `zodJson(schema, …)` has validated the body. */
export type JsonContext<S extends z.ZodType, P extends string = string> = Context<AppEnv, P, ZodJsonInput<S>>

/** A handler's context once `zodQuery(pageQuerySchema, …)` has validated `?limit&offset`. */
export type PageContext = Context<AppEnv, string, ZodQueryInput<typeof pageQuerySchema>>

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

/**
 * May the actor edit (or delete) a role, given everywhere it is assigned?
 *
 * A role's effect is per-assignment, so mutating it rewrites authority at every scope
 * it is assigned on. The actor must hold `manage_roles` on EVERY such scope and pass
 * `canGrant()` there for both the current and the incoming permissions. `revokes`
 * (deletion) additionally needs `manage_users` per scope, since the cascade drops
 * those assignments. A role with no assignment grants nothing yet, so it falls back
 * to {@link holdsAll}.
 */
export function canMutateRole(
  actor: EffectivePermissions,
  assignments: readonly PermissionAssignment[],
  currentPermissions: readonly Permission[],
  nextPermissions: readonly Permission[],
  revokes = false,
): boolean {
  if (assignments.length === 0) {
    return holdsAll(actor, currentPermissions) && holdsAll(actor, nextPermissions)
  }
  const touched = [...currentPermissions, ...nextPermissions]
  return assignments.every(({ scope }) =>
    hasPermission(actor, 'manage_roles', scope)
    && (!revokes || hasPermission(actor, 'manage_users', scope))
    && canGrant(actor, scope, touched),
  )
}

/** `zodJson` refusal shared by every RBAC body: not JSON at all is a 400, JSON the schema rejects is a 422. */
export function rejectInvalidBody(context: AppContext, error: z.ZodError, cause: ZodJsonRefusal) {
  if (cause === 'malformed') {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', error.message)
}

/** `zodQuery` refusal of the paged listings: a malformed `limit` or `offset`. */
export function rejectInvalidPage(context: AppContext) {
  return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', 'Invalid limit or offset.')
}

/**
 * The page of a paged administration listing. A client that sends neither `limit` nor `offset`
 * gets the first {@link MAX_PAGE_SIZE} rows.
 */
export function pageOf(query: z.output<typeof pageQuerySchema>): PageRequest {
  return { limit: query.limit ?? MAX_PAGE_SIZE, offset: query.offset ?? 0 }
}

/**
 * Refuses a malformed account id with 404 before the body is read: an id that cannot exist must
 * not reveal, through a 400/422, what the body contract looks like.
 */
export const requireValidUserId: MiddlewareHandler<AppEnv, '/users/:userId/active'> = async (context, next) => {
  if (!context.get('idGenerator').isValid(context.req.param('userId'))) {
    return rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')
  }
  await next()
}

/** {@link requireValidUserId} for a role id. */
export const requireValidRoleId: MiddlewareHandler<AppEnv, '/roles/:roleId'> = async (context, next) => {
  if (!context.get('idGenerator').isValid(context.req.param('roleId'))) {
    return rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')
  }
  await next()
}
