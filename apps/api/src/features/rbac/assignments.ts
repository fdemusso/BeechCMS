// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { GLOBAL_SCOPE, canGrant, hasPermission } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { RBAC_ERRORS } from './constants'
import { canAdministerAccount, rbacProblem, readJson, type AppContext } from './guards'
import { createAssignmentSchema } from './rbac.schema'

/**
 * GET /api/rbac/users/:userId/assignments
 * Raw rows plus an `active` flag: an assignment naming a deleted seed still exists and
 * must remain visible and removable, even though it currently grants nothing.
 */
export const listAssignmentsHandler = async (context: AppContext) => {
  const userId = context.req.param('userId')
  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')
  if (!context.get('idGenerator').isValid(userId)) return notFound()

  const assignmentRepository = context.get('roleAssignmentRepository')
  const all = await assignmentRepository.listAllForUser(userId)

  const actor = await resolveEffectivePermissions(context)
  const actorId = context.get('jwtPayload')?.sub ?? ''
  if (userId !== actorId && !canAdministerAccount(actor, all)) return notFound()

  const activeIds = new Set((await assignmentRepository.listActiveForUser(userId)).map(a => a.id))
  const roleIds = [...new Set(all.map(a => a.roleId))]
  const roles = await context.get('roleRepository').findByIds(roleIds)
  const roleById = new Map(roles.map(role => [role.id, role]))

  return context.json({
    assignments: all.map(assignment => ({
      ...assignment,
      active: activeIds.has(assignment.id),
      roleName: roleById.get(assignment.roleId)?.name ?? null,
      permissions: roleById.get(assignment.roleId)?.permissions ?? [],
    })),
  })
}

/**
 * POST /api/rbac/assignments
 * The anti-escalation choke point (brief §2, §4). TWO independent conditions:
 *   1. the actor holds `manage_users` ON THE TARGET SCOPE — `hasPermission` refuses a
 *      seed-scoped actor targeting `'*'` by construction;
 *   2. `canGrant()` — every permission the role carries is already held by the actor at
 *      that scope.
 * Idempotent: the repository's `INSERT OR IGNORE` + read-back returns the existing id.
 */
export const createAssignmentHandler = async (context: AppContext) => {
  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = createAssignmentSchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const { userId, roleId, scope } = parsed.data
  const idGenerator = context.get('idGenerator')
  if (!idGenerator.isValid(userId) || !idGenerator.isValid(roleId)) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', 'Malformed id.')
  }

  // A scope is `'*'` or the slug of an ACTIVE seed. `getSeed` reads the registry hydrated
  // from `listActive()`, i.e. the exact predicate the assignment decay filter uses.
  if (scope !== GLOBAL_SCOPE && context.get('getSeed')(scope) === null) {
    return rbacProblem(context, RBAC_ERRORS.UNKNOWN_SCOPE, 422, 'Unprocessable Entity', 'Scope is not an active seed slug.')
  }

  const target = await context.get('userRepository').findById(userId)
  if (!target) return rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')

  const role = await context.get('roleRepository').findById(roleId)
  if (!role) return rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')

  const actor = await resolveEffectivePermissions(context)
  if (!hasPermission(actor, 'manage_users', scope)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.FORBIDDEN,
      403,
      'Forbidden',
      `Assigning on scope '${scope}' requires 'manage_users' on that scope.`,
    )
  }
  if (!canGrant(actor, scope, role.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'The role carries permissions the caller does not hold on this scope.',
    )
  }

  const id = await context.get('roleAssignmentRepository').create({ userId, roleId, scope })
  return context.json({ id, userId, roleId, scope }, 201)
}

/**
 * DELETE /api/rbac/assignments/:assignmentId
 * Authorized on the assignment's OWN scope, then guarded against removing the platform's
 * last global administrator.
 */
export const deleteAssignmentHandler = async (context: AppContext) => {
  const assignmentId = context.req.param('assignmentId')
  const assignmentRepository = context.get('roleAssignmentRepository')

  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such assignment.')
  if (!context.get('idGenerator').isValid(assignmentId)) return notFound()

  const assignment = await assignmentRepository.findById(assignmentId)
  if (!assignment) return notFound()

  const actor = await resolveEffectivePermissions(context)
  if (!hasPermission(actor, 'manage_users', assignment.scope)) return notFound()

  if (assignment.scope === GLOBAL_SCOPE) {
    const role = await context.get('roleRepository').findById(assignment.roleId)
    if (role?.permissions.includes('manage_users')) {
      const others = await assignmentRepository.countActiveGlobalAdminsExcludingUser(assignment.userId)
      if (others === 0) {
        return rbacProblem(
          context,
          RBAC_ERRORS.LAST_GLOBAL_ADMIN,
          409,
          'Conflict',
          'This assignment carries the last active global administrator and cannot be removed.',
        )
      }
    }
  }

  const deleted = await assignmentRepository.delete(assignmentId)
  if (!deleted) return notFound()
  return context.body(null, 204)
}
