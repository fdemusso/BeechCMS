// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { MiddlewareHandler } from 'hono'
import { GLOBAL_SCOPE, buildEffectivePermissions, canGrant, hasPermission, isValidAccountEmail, sha256hex, type EffectivePermissions } from '@beechcms/core'
import { getClientIp } from '../../shared/utils/request-utils'
import { publicProblem } from '../../public/errors/problem-details'
import { RBAC_ERRORS } from './constants'
import type { AppEnv } from '../../types'
import { rbacProblem, type AppContext, type JsonContext } from './guards'
import type { acceptInvitationSchema } from './rbac.schema'

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

/**
 * Per-IP rate limit shared by both public routes. A middleware so that on `accept` it runs before
 * the body is read: a throttled caller learns nothing about the body contract.
 */
export const limitInvitationRequests: MiddlewareHandler<AppEnv> = async (context, next) => {
  const ip = getClientIp(context.req)
  const limit = await context.get('rateLimiters').getLimiter('acceptInvitation').checkLimit(ip)
  if (!limit.isAllowed) {
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
  await next()
}

/**
 * GET /auth/invitations/:token
 * Lets the sprint-5 activation screen render "you were invited as X on Y" before asking
 * for a password.
 */
export const previewInvitationHandler = async (context: AppContext) => {
  const invalid = () => rbacProblem(context, RBAC_ERRORS.INVITATION_INVALID, 404, 'Not Found', 'Invitation is unknown, expired or already used.')

  const tokenHash = await sha256hex(context.req.param('token') ?? '')
  const invitation = await context.get('invitationRepository').findValidByHash(tokenHash, context.get('clock').nowSeconds())
  if (!invitation) return invalid()

  const role = await context.get('roleRepository').findById(invitation.roleId)
  if (!role) return invalid()

  return context.json({ email: invitation.email, roleName: role.name, scope: invitation.scope }, 200)
}

/**
 * POST /auth/invitations/accept
 * Creates the account, its assignment and the consumption of the invitation in one atomic
 * write, so a failure never burns the invitation or strands an account without a role.
 * No token, no session: the activated account logs in through `POST /auth/login` like any other.
 */
export const acceptInvitationHandler = async (context: JsonContext<typeof acceptInvitationSchema>) => {
  const input = context.req.valid('json')

  const invalid = () => rbacProblem(context, RBAC_ERRORS.INVITATION_INVALID, 404, 'Not Found', 'Invitation is unknown, expired or already used.')

  const now = context.get('clock').nowSeconds()
  const invitationRepository = context.get('invitationRepository')
  const tokenHash = await sha256hex(input.token)
  const invitation = await invitationRepository.findValidByHash(tokenHash, now)
  if (!invitation) return invalid()
  // Legacy invitations may predate validation parity with login.
  if (!isValidAccountEmail(invitation.email)) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', 'Invalid invitation email address.')
  }

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

  const emailTaken = () =>
    rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
  if (await userRepository.findByEmail(invitation.email)) return emailTaken()

  const userId = context.get('idGenerator').uuid()
  const passwordHash = await context.get('hashProvider').hash(input.password)

  try {
    const redeemed = await invitationRepository.redeem({
      invitationId: invitation.id,
      user: {
        id: userId,
        email: invitation.email,
        passwordHash,
        name: input.name ?? null,
        surname: input.surname ?? null,
      },
      assignmentId: context.get('idGenerator').uuid(),
      roleId: invitation.roleId,
      scope: invitation.scope,
      usedAt: now,
    })
    if (!redeemed) return invalid()
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return emailTaken()
    throw error
  }

  return context.json({ id: userId, email: invitation.email }, 201)
}
