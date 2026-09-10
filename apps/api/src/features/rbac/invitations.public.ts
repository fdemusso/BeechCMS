// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { GLOBAL_SCOPE, buildEffectivePermissions, canGrant, hasPermission, sha256hex, type EffectivePermissions } from '@beechcms/core'
import { getClientIp } from '../../shared/utils/request-utils'
import { publicProblem } from '../../public/problem-details'
import { RBAC_ERRORS } from './constants'
import { rbacProblem, readJson, type AppContext } from './guards'
import { acceptInvitationSchema } from './rbac.schema'

/** Issuer authority resolved WITHOUT a JWT: the redeem path has no authenticated
 *  subject, so `resolveEffectivePermissions` (which reads `jwtPayload`) cannot be used.
 *  Same core evaluator, different subject. */
async function resolveIssuerAuthority(
  context: AppContext,
  issuerId: string,
): Promise<EffectivePermissions> {
  const assignments = await context.get('roleAssignmentRepository').listActiveForUser(issuerId)
  if (assignments.length === 0) return { global: new Set(), byScope: new Map() }
  const roles = await context.get('roleRepository').findByIds([...new Set(assignments.map(a => a.roleId))])
  return buildEffectivePermissions(assignments, roles)
}

async function checkInviteRateLimit(context: AppContext): Promise<Response | null> {
  const ip = getClientIp(context.req)
  const limit = await context.get('rateLimiters').getLimiter('acceptInvitation').checkLimit(ip)
  if (limit.isAllowed) return null
  const headers: Record<string, string> = {}
  if (limit.retryAfterSeconds !== undefined) headers['Retry-After'] = String(limit.retryAfterSeconds)
  return publicProblem(context, {
    type: 'too-many-requests',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Too many requests.',
    headers,
  })
}

/**
 * GET /auth/invitations/:token
 * Lets the sprint-5 activation screen render "you were invited as X on Y" before asking
 * for a password.
 */
export const previewInvitationHandler = async (context: AppContext) => {
  const limited = await checkInviteRateLimit(context)
  if (limited) return limited

  const invalid = () => rbacProblem(context, RBAC_ERRORS.INVITATION_INVALID, 404, 'Not Found', 'Invitation is unknown, expired or already used.')

  const tokenHash = await sha256hex(context.req.param('token') ?? '')
  const invitation = await context.get('invitationRepository').findValidByHash(tokenHash, context.get('clock').nowSeconds())
  if (!invitation) return invalid()

  const role = await context.get('roleRepository').findById(invitation.roleId)
  if (!role) return invalid()

  return context.json({ email: invitation.email, roleName: role.name, scope: invitation.scope })
}

/**
 * POST /auth/invitations/accept
 * Consumes the invitation FIRST, atomically, then creates the account. No token, no
 * session: the activated account logs in through `POST /auth/login` like any other.
 */
export const acceptInvitationHandler = async (context: AppContext) => {
  const limited = await checkInviteRateLimit(context)
  if (limited) return limited

  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = acceptInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const invalid = () => rbacProblem(context, RBAC_ERRORS.INVITATION_INVALID, 404, 'Not Found', 'Invitation is unknown, expired or already used.')

  const now = context.get('clock').nowSeconds()
  const invitationRepository = context.get('invitationRepository')
  const tokenHash = await sha256hex(parsed.data.token)
  const invitation = await invitationRepository.findValidByHash(tokenHash, now)
  if (!invitation) return invalid()

  const role = await context.get('roleRepository').findById(invitation.roleId)
  if (!role) return invalid()

  if (invitation.scope !== GLOBAL_SCOPE && context.get('getSeed')(invitation.scope) === null) {
    return rbacProblem(context, RBAC_ERRORS.UNKNOWN_SCOPE, 422, 'Unprocessable Entity', 'Scope is not an active seed slug.')
  }

  const userRepository = context.get('userRepository')
  const issuer = await userRepository.findById(invitation.invitedBy)
  const revoked = () =>
    rbacProblem(context, RBAC_ERRORS.INVITATION_REVOKED, 409, 'Conflict', 'The issuer no longer holds the authority this invitation would grant.')
  if (!issuer || !issuer.isActive) return revoked()

  const authority = await resolveIssuerAuthority(context, invitation.invitedBy)
  if (!hasPermission(authority, 'manage_users', invitation.scope) || !canGrant(authority, invitation.scope, role.permissions)) {
    return revoked()
  }

  if (!(await invitationRepository.markUsed(invitation.id, now))) return invalid()

  if (await userRepository.findByEmail(invitation.email)) {
    return rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
  }

  const userId = context.get('idGenerator').uuid()
  const passwordHash = await context.get('hashProvider').hash(parsed.data.password)

  try {
    await userRepository.create({
      id: userId,
      email: invitation.email,
      passwordHash,
      role: 'editor',
      name: parsed.data.name ?? null,
      surname: parsed.data.surname ?? null,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
    }
    throw error
  }

  await context.get('roleAssignmentRepository').create({ userId, roleId: invitation.roleId, scope: invitation.scope })

  return context.json({ id: userId, email: invitation.email }, 201)
}
