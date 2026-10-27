// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { RBAC_ERRORS } from './constants'
import { canMutateRole, holdsAll, rbacProblem, type AppContext, type JsonContext } from './guards'
import type { roleBodySchema } from './rbac.schema'

/** GET /api/rbac/roles — the full catalogue, system roles included (they are assignable). */
export const listRolesHandler = async (context: AppContext) => {
  const roles = await context.get('roleRepository').listAll()
  return context.json({ roles }, 200)
}

/**
 * POST /api/rbac/roles
 * A role is a GLOBAL object with no scope of its own, so authoring is gated on what the
 * actor holds anywhere: nobody may mint a role carrying authority they lack. The
 * scope-precise rule stays `canGrant()` at assignment time — minting a role is never, by
 * itself, an escalation.
 */
export const createRoleHandler = async (context: JsonContext<typeof roleBodySchema>) => {
  const input = context.req.valid('json')

  const actor = await resolveEffectivePermissions(context)
  if (!holdsAll(actor, input.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not carry a permission the caller does not hold.',
    )
  }

  const roleRepository = context.get('roleRepository')

  try {
    const id = await roleRepository.create({
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      permissions: input.permissions,
    })
    return context.json({ id }, 201)
  } catch (error) {
    // `roles.name` is UNIQUE: the constraint, not a read of the whole catalogue, is the arbiter.
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return rbacProblem(context, RBAC_ERRORS.ROLE_NAME_TAKEN, 409, 'Conflict', 'A role with this name already exists.')
    }
    throw error
  }
}

/**
 * PUT /api/rbac/roles/:roleId
 * Replaces name, description and the whole permission set. The actor must hold every
 * permission in BOTH the current and the incoming set: editing a role more powerful than
 * yourself is escalation whichever direction it moves.
 */
export const updateRoleHandler = async (context: JsonContext<typeof roleBodySchema, '/roles/:roleId'>) => {
  const roleId = context.req.param('roleId')
  const input = context.req.valid('json')
  const roleRepository = context.get('roleRepository')

  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')

  const role = await roleRepository.findById(roleId)
  if (!role) return notFound()

  if (role.isSystem) {
    return rbacProblem(
      context,
      RBAC_ERRORS.SYSTEM_ROLE_IMMUTABLE,
      409,
      'Conflict',
      'System roles are provisioned by migration and cannot be modified.',
    )
  }

  const actor = await resolveEffectivePermissions(context)
  const assignments = await context.get('roleAssignmentRepository').listByRole(roleId)
  if (!canMutateRole(actor, assignments, role.permissions, input.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not be edited without full authority on every scope it is assigned to.',
    )
  }

  try {
    const result = await roleRepository.update(roleId, {
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      permissions: input.permissions,
    })
    if (result === 'not-found') return notFound()
    if (result === 'last-global-admin') return lastAdminRoleProblem(context)
  } catch (error) {
    // `roles.name` is UNIQUE: the constraint, not a pre-read, is the only race-free arbiter.
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return rbacProblem(context, RBAC_ERRORS.ROLE_NAME_TAKEN, 409, 'Conflict', 'A role with this name already exists.')
    }
    throw error
  }

  return context.json({ id: roleId }, 200)
}

/** DELETE /api/rbac/roles/:roleId — cascades to role_permissions and every assignment (FK). */
export const deleteRoleHandler = async (context: AppContext) => {
  const roleId = context.req.param('roleId')
  const roleRepository = context.get('roleRepository')

  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')
  if (!context.get('idGenerator').isValid(roleId)) return notFound()

  const role = await roleRepository.findById(roleId)
  if (!role) return notFound()

  if (role.isSystem) {
    return rbacProblem(
      context,
      RBAC_ERRORS.SYSTEM_ROLE_IMMUTABLE,
      409,
      'Conflict',
      'System roles are provisioned by migration and cannot be deleted.',
    )
  }

  const actor = await resolveEffectivePermissions(context)
  const assignments = await context.get('roleAssignmentRepository').listByRole(roleId)
  if (!canMutateRole(actor, assignments, role.permissions, [], true)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not be deleted without full authority on every scope it is assigned to.',
    )
  }

  const result = await roleRepository.delete(roleId)
  if (result === 'not-found') return notFound()
  if (result === 'last-global-admin') return lastAdminRoleProblem(context)

  return context.body(null, 204)
}

/**
 * LAST-ADMIN GUARDRAIL, role edition. The repository refuses, inside the write itself, an
 * edit that strips `manage_users` from (or a delete of) a role carrying the last active
 * global administrator; this only renders the refusal.
 */
function lastAdminRoleProblem(context: AppContext) {
  return rbacProblem(
    context,
    RBAC_ERRORS.LAST_GLOBAL_ADMIN,
    409,
    'Conflict',
    'This role carries the last global administrator; it cannot lose `manage_users` or be deleted.',
  )
}
