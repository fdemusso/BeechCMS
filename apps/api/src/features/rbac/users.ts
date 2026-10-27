// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { AccountSummary, PermissionAssignment } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { RBAC_ERRORS } from './constants'
import { canAdministerAccount, pageOf, rbacProblem, type AppContext, type JsonContext, type PageContext } from './guards'
import type { createUserSchema, setActiveSchema } from './rbac.schema'

/**
 * The developer/owner axis (`users.role`) is NOT grantable from the dashboard:
 * - 'admin' is the Developer / instance owner (minted only by `POST /auth/setup`).
 * - 'editor' is a generic Beech user whose permissions are managed via RBAC.
 *   (Named 'editor' for legacy/CHECK-constraint compatibility, representing a standard user).
 *
 * Every account minted here receives CREATED_ACCOUNT_ROLE ('editor'), so no RBAC path can
 * produce an account that clears `requireAdmin()` and reaches `/api/seeds/*`.
 */
const CREATED_ACCOUNT_ROLE = 'editor'

type AccountView = AccountSummary & { assignments: PermissionAssignment[] }

/**
 * GET /api/rbac/users?limit&offset
 * Accounts the caller may administer, each with its raw (non-decayed) assignments.
 * The caller's own account is always included.
 *
 * Paged over the accounts table; the visibility filter applies to each page afterwards, so a
 * page may hold fewer than `limit` rows. `nextOffset` is null on the last page.
 */
export const listUsersHandler = async (context: PageContext) => {
  const page = pageOf(context.req.valid('query'))

  const actor = await resolveEffectivePermissions(context)
  const actorId = context.get('jwtPayload')?.sub ?? ''

  // One extra row tells whether another page exists without a COUNT.
  const fetched = await context.get('userRepository').listAccounts({ limit: page.limit + 1, offset: page.offset })
  const accounts = fetched.slice(0, page.limit)
  const allAssignments = await context.get('roleAssignmentRepository').listForUsers(accounts.map(account => account.id))

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

  return context.json({ users, nextOffset: fetched.length > page.limit ? page.offset + page.limit : null }, 200)
}

/**
 * POST /api/rbac/users
 * Creates a ZERO-TRUST account: no role, no scope, no visibility until assigned
 * (brief §2). Any `manage_users` holder may create one; only assignment is scope-gated.
 */
export const createUserHandler = async (context: JsonContext<typeof createUserSchema>) => {
  const input = context.req.valid('json')

  const email = input.email.toLowerCase()
  const userRepository = context.get('userRepository')

  if (await userRepository.findByEmail(email)) {
    return rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
  }

  const id = context.get('idGenerator').uuid()
  const passwordHash = await context.get('hashProvider').hash(input.password)

  try {
    await userRepository.create({
      id,
      email,
      passwordHash,
      role: CREATED_ACCOUNT_ROLE,
      name: input.name ?? null,
      surname: input.surname ?? null,
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
      name: input.name ?? null,
      surname: input.surname ?? null,
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

  const account = await context.get('userRepository').findAccountById(userId)
  if (!account) return notFound()

  const assignments = await context.get('roleAssignmentRepository').listAllForUser(userId)
  if (account.id !== actorId && !canAdministerAccount(actor, assignments)) return notFound()

  return context.json({ ...account, assignments }, 200)
}

/**
 * PATCH /api/rbac/users/:userId/active
 * Reversible deactivation. On deactivation every refresh token of the account is revoked
 * in the same request, so the session dies with the flag rather than at the next refresh;
 * `permissionMiddleware()` already refuses the still-unexpired access JWT with 403
 * `account_disabled`.
 */
export const setUserActiveHandler = async (context: JsonContext<typeof setActiveSchema, '/users/:userId/active'>) => {
  const userId = context.req.param('userId')
  const { isActive } = context.req.valid('json')

  const notFound = () =>
    rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such account.')

  const userRepository = context.get('userRepository')
  const assignmentRepository = context.get('roleAssignmentRepository')

  const target = await userRepository.findById(userId)
  if (!target) return notFound()

  const assignments = await assignmentRepository.listAllForUser(userId)
  const actor = await resolveEffectivePermissions(context)
  if (!canAdministerAccount(actor, assignments)) return notFound()

  if (!isActive && target.role === 'admin') {
    // The Developer is usually also the sole administrator; that is the more fundamental refusal.
    if (await userRepository.isLastGlobalAdmin(userId)) return lastAdminProblem(context)
    return rbacProblem(
      context,
      RBAC_ERRORS.DEVELOPER_PROTECTED,
      409,
      'Conflict',
      'The developer account cannot be deactivated.',
    )
  }

  // LAST-ADMIN GUARDRAIL, enforced inside the UPDATE itself (brief §4: no self-revocation, so
  // the refusal applies to the holder too). A count read beforehand would let two concurrent
  // deactivations of different administrators both pass.
  const result = await userRepository.setActive(userId, isActive)
  if (result === 'not-found') return notFound()
  if (result === 'last-global-admin') return lastAdminProblem(context)

  if (!isActive) {
    await context.get('sessionRepository').revokeAllForUser(userId, context.get('clock').nowSeconds())
  }

  return context.json({ id: userId, isActive }, 200)
}

function lastAdminProblem(context: AppContext) {
  return rbacProblem(
    context,
    RBAC_ERRORS.LAST_GLOBAL_ADMIN,
    409,
    'Conflict',
    'This is the last active account able to administer the platform; it cannot be deactivated.',
  )
}
