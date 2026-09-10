// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { AccountSummary, PermissionAssignment } from '@beechcms/core'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { RBAC_ERRORS } from './constants'
import { canAdministerAccount, rbacProblem, readJson, type AppContext } from './guards'
import { createUserSchema, setActiveSchema } from './rbac.schema'

/**
 * The developer/owner axis (`users.role`) is NOT grantable from the dashboard: every
 * account minted here is an `'editor'`, so no RBAC path can ever produce an account that
 * clears `requireAdmin()` and reaches `/api/seeds/*` (brief §2). `POST /auth/setup`
 * remains the only producer of `role = 'admin'`.
 */
const CREATED_ACCOUNT_ROLE = 'editor'

type AccountView = AccountSummary & { assignments: PermissionAssignment[] }

/**
 * GET /api/rbac/users
 * Accounts the caller may administer, each with its raw (non-decayed) assignments.
 * The caller's own account is always included.
 */
export const listUsersHandler = async (context: AppContext) => {
  const actor = await resolveEffectivePermissions(context)
  const actorId = context.get('jwtPayload')?.sub ?? ''

  const accounts = await context.get('userRepository').listAccounts()
  const allAssignments = await context.get('roleAssignmentRepository').listAll()

  const byUser = new Map<string, PermissionAssignment[]>()
  for (const assignment of allAssignments) {
    const bucket = byUser.get(assignment.userId)
    if (bucket) bucket.push(assignment)
    else byUser.set(assignment.userId, [assignment])
  }

  const users: AccountView[] = []
  for (const account of accounts) {
    const assignments = byUser.get(account.id) ?? []
    if (account.id !== actorId && !canAdministerAccount(actor, assignments)) continue
    users.push({ ...account, assignments })
  }

  return context.json({ users })
}

/**
 * POST /api/rbac/users
 * Creates a ZERO-TRUST account: no role, no scope, no visibility until assigned
 * (brief §2). Any `manage_users` holder may create one; only assignment is scope-gated.
 */
export const createUserHandler = async (context: AppContext) => {
  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }

  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const email = parsed.data.email.toLowerCase()
  const userRepository = context.get('userRepository')

  if (await userRepository.findByEmail(email)) {
    return rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
  }

  const id = context.get('idGenerator').uuid()
  const passwordHash = await context.get('hashProvider').hash(parsed.data.password)

  try {
    await userRepository.create({
      id,
      email,
      passwordHash,
      role: CREATED_ACCOUNT_ROLE,
      name: parsed.data.name ?? null,
      surname: parsed.data.surname ?? null,
    })
  } catch (error) {
    // Race backstop: two concurrent creates with the same email.
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
    }
    throw error
  }

  return context.json(
    {
      id,
      email,
      name: parsed.data.name ?? null,
      surname: parsed.data.surname ?? null,
      role: CREATED_ACCOUNT_ROLE,
      isActive: true,
      assignments: [],
    },
    201,
  )
}

/**
 * GET /api/rbac/users/:userId
 * 404 (never 403) when the caller may not administer the target: an authorization
 * refusal here would be an enumeration oracle for accounts outside the caller's scope.
 */
export const getUserHandler = async (context: AppContext) => {
  const userId = context.req.param('userId')
  const actor = await resolveEffectivePermissions(context)
  const actorId = context.get('jwtPayload')?.sub ?? ''

  const notFound = () =>
    rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')

  if (!context.get('idGenerator').isValid(userId)) return notFound()

  const account = (await context.get('userRepository').listAccounts()).find(a => a.id === userId)
  if (!account) return notFound()

  const assignments = await context.get('roleAssignmentRepository').listAllForUser(userId)
  if (account.id !== actorId && !canAdministerAccount(actor, assignments)) return notFound()

  return context.json({ ...account, assignments })
}

/**
 * PATCH /api/rbac/users/:userId/active
 * Reversible deactivation. On deactivation every refresh token of the account is revoked
 * in the same request, so the session dies with the flag rather than at the next refresh;
 * `permissionMiddleware()` already refuses the still-unexpired access JWT with 403
 * `account_disabled`.
 */
export const setUserActiveHandler = async (context: AppContext) => {
  const userId = context.req.param('userId')
  const idGenerator = context.get('idGenerator')

  const notFound = () =>
    rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')

  if (!idGenerator.isValid(userId)) return notFound()

  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = setActiveSchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const userRepository = context.get('userRepository')
  const assignmentRepository = context.get('roleAssignmentRepository')

  const target = await userRepository.findById(userId)
  if (!target) return notFound()

  const assignments = await assignmentRepository.listAllForUser(userId)
  const actor = await resolveEffectivePermissions(context)
  if (!canAdministerAccount(actor, assignments)) return notFound()

  // LAST-ADMIN GUARDRAIL. `countActiveGlobalAdminsExcludingUser` counts OTHER accounts
  // that can still administer the platform. Zero means this account is the last one, and
  // the refusal applies to everyone — the holder included (brief §4: no self-revocation).
  if (!parsed.data.isActive) {
    const others = await assignmentRepository.countActiveGlobalAdminsExcludingUser(userId)
    if (others === 0) {
      const isGlobalAdmin = await holdsGlobalManageUsers(context, userId)
      if (isGlobalAdmin) {
        return rbacProblem(
          context,
          RBAC_ERRORS.LAST_GLOBAL_ADMIN,
          409,
          'Conflict',
          'This is the last active account able to administer the platform; it cannot be deactivated.',
        )
      }
    }
  }

  const changed = await userRepository.setActive(userId, parsed.data.isActive)
  if (!changed) return notFound()

  if (!parsed.data.isActive) {
    await context.get('sessionRepository').revokeAllForUser(userId, context.get('clock').nowSeconds())
  }

  return context.json({ id: userId, isActive: parsed.data.isActive })
}

/** Whether a user currently holds `manage_users` at `'*'` through any live assignment. */
async function holdsGlobalManageUsers(context: AppContext, userId: string): Promise<boolean> {
  const assignments = await context.get('roleAssignmentRepository').listActiveForUser(userId)
  const globalRoleIds = [...new Set(assignments.filter(a => a.scope === GLOBAL_SCOPE).map(a => a.roleId))]
  if (globalRoleIds.length === 0) return false
  const roles = await context.get('roleRepository').findByIds(globalRoleIds)
  return roles.some(role => role.permissions.includes('manage_users'))
}
