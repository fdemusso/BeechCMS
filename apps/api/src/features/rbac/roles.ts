// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { GLOBAL_SCOPE } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { RBAC_ERRORS } from './constants'
import { holdsAll, rbacProblem, readJson, type AppContext } from './guards'
import { roleBodySchema } from './rbac.schema'

/** GET /api/rbac/roles — the full catalogue, system roles included (they are assignable). */
export const listRolesHandler = async (context: AppContext) => {
  const roles = await context.get('roleRepository').listAll()
  return context.json({ roles })
}

/**
 * POST /api/rbac/roles
 * A role is a GLOBAL object with no scope of its own, so authoring is gated on what the
 * actor holds anywhere: nobody may mint a role carrying authority they lack. The
 * scope-precise rule stays `canGrant()` at assignment time — minting a role is never, by
 * itself, an escalation.
 */
export const createRoleHandler = async (context: AppContext) => {
  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = roleBodySchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const actor = await resolveEffectivePermissions(context)
  if (!holdsAll(actor, parsed.data.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not carry a permission the caller does not hold.',
    )
  }

  const roleRepository = context.get('roleRepository')
  const existing = await roleRepository.listAll()
  if (existing.some(role => role.name === parsed.data.name)) {
    return rbacProblem(context, RBAC_ERRORS.ROLE_NAME_TAKEN, 409, 'Conflict', 'A role with this name already exists.')
  }

  try {
    const id = await roleRepository.create({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
      permissions: parsed.data.permissions,
    })
    return context.json({ id }, 201)
  } catch (error) {
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
export const updateRoleHandler = async (context: AppContext) => {
  const roleId = context.req.param('roleId')
  const roleRepository = context.get('roleRepository')

  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')
  if (!context.get('idGenerator').isValid(roleId)) return notFound()

  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = roleBodySchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

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
  if (!holdsAll(actor, role.permissions) || !holdsAll(actor, parsed.data.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not be edited by a caller who does not hold all of its permissions.',
    )
  }

  const refusal = await refuseIfLastAdminRole(context, roleId, role.permissions, parsed.data.permissions)
  if (refusal) return refusal

  const updated = await roleRepository.update(roleId, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    icon: parsed.data.icon ?? null,
    permissions: parsed.data.permissions,
  })
  if (!updated) return notFound()

  return context.json({ id: roleId })
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
  if (!holdsAll(actor, role.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'A role may not be deleted by a caller who does not hold all of its permissions.',
    )
  }

  const refusal = await refuseIfLastAdminRole(context, roleId, role.permissions, [])
  if (refusal) return refusal

  const deleted = await roleRepository.delete(roleId)
  if (!deleted) return notFound()

  return context.body(null, 204)
}

/**
 * LAST-ADMIN GUARDRAIL, role edition.
 *
 * Refuses a mutation that would strip `manage_users` from a role currently assigned at
 * `'*'` when no OTHER role still carries an active global administrator. Deletion passes
 * `nextPermissions: []`, which is the same question.
 */
async function refuseIfLastAdminRole(
  context: AppContext,
  roleId: string,
  currentPermissions: readonly string[],
  nextPermissions: readonly string[],
) {
  const losesManageUsers =
    currentPermissions.includes('manage_users') && !nextPermissions.includes('manage_users')
  if (!losesManageUsers) return null

  const assignmentRepository = context.get('roleAssignmentRepository')
  const globalAssignments = (await assignmentRepository.listByRole(roleId))
    .filter(assignment => assignment.scope === GLOBAL_SCOPE)
  if (globalAssignments.length === 0) return null

  const others = await assignmentRepository.countActiveGlobalAdminsExcludingRole(roleId)
  if (others > 0) return null

  return rbacProblem(
    context,
    RBAC_ERRORS.LAST_GLOBAL_ADMIN,
    409,
    'Conflict',
    'This role carries the last global administrator; it cannot lose `manage_users` or be deleted.',
  )
}
