// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { GLOBAL_SCOPE, canGrant, hasPermission } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { sendInvitationEmail, resolveEmailLocale, type EmailLocale } from '../../shared/email'
import { generateOpaqueToken } from '../../shared/utils/opaque-token'
import { sha256hex } from '@beechcms/core'
import { RBAC_ERRORS } from './constants'
import { rbacProblem, readJson, type AppContext } from './guards'
import { createInvitationSchema } from './rbac.schema'

/** 72 hours (brief §3: "link di invito con scadenza"; §4: an expired one is regenerable). */
const INVITATION_TTL_SECONDS = 72 * 60 * 60

/** Whether an email provider is configured; email delivery is best-effort, never a precondition. */
function isEmailConfigured(context: AppContext): boolean {
  return context.env.EMAIL_PROVIDER === 'smtp' || !!context.env.RESEND_API_KEY
}

/** Absolute accept-invite URL. Also returned to the caller so it can be copied manually
 *  when no email provider is configured, or as a secondary delivery channel when one is. */
function buildInviteUrl(context: AppContext, token: string): string {
  const { env, req } = context
  const baseUrl = (env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, '')
  return `${baseUrl}/admin/accept-invite?token=${token}`
}

/**
 * Copied structurally from `password-reset/request.ts:96-126`, including the
 * `executionCtx` fallback that keeps tests working outside a Workers runtime.
 * No-ops when no email provider is configured: the invitation still exists and its
 * link is returned to the caller, so email is a convenience, not a requirement.
 */
function dispatchInvitationEmail(
  context: AppContext,
  args: { to: string; inviteUrl: string; roleName: string; scope: string; locale: EmailLocale },
): void {
  if (!isEmailConfigured(context)) return

  const { env } = context
  const smtpBaseUrl = env.SMTP_HOST ? `http://${env.SMTP_HOST}:${env.SMTP_PORT ?? '8025'}` : undefined
  const scopeLabel = args.scope === GLOBAL_SCOPE ? 'all content' : args.scope

  const send = async () => {
    try {
      await sendInvitationEmail({
        to: args.to,
        inviteUrl: args.inviteUrl,
        roleName: args.roleName,
        scopeLabel,
        locale: args.locale,
        apiKey: env.RESEND_API_KEY ?? '',
        from: env.EMAIL_FROM,
        isDev: env.ENV !== 'production',
        provider: env.EMAIL_PROVIDER as 'smtp' | 'resend' | undefined,
        smtpBaseUrl,
      })
    } catch (error) {
      if (env.ENV !== 'production' && process.env.NODE_ENV !== 'test') console.error('[rbac-invitations] Failed to send email:', error)
    }
  }

  try {
    context.executionCtx.waitUntil(send())
  } catch {
    void send()
  }
}

/**
 * POST /api/rbac/invitations
 * Issues a deferred (role, scope) grant: the same two anti-escalation checks as
 * `createAssignmentHandler`, because an invitation IS a deferred assignment.
 */
export const createInvitationHandler = async (context: AppContext) => {
  const body = await readJson(context)
  if (body === undefined) {
    return rbacProblem(context, RBAC_ERRORS.INVALID_JSON, 400, 'Bad Request', 'Request body is not valid JSON.')
  }
  const parsed = createInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', parsed.error.message)
  }

  const email = parsed.data.email.toLowerCase()
  if (await context.get('userRepository').findByEmail(email)) {
    return rbacProblem(context, RBAC_ERRORS.EMAIL_TAKEN, 409, 'Conflict', 'An account with this email already exists.')
  }

  const { roleId, scope } = parsed.data
  if (!context.get('idGenerator').isValid(roleId)) {
    return rbacProblem(context, RBAC_ERRORS.VALIDATION_FAILED, 422, 'Unprocessable Entity', 'Malformed id.')
  }
  const role = await context.get('roleRepository').findById(roleId)
  if (!role) return rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such role.')

  if (scope !== GLOBAL_SCOPE && context.get('getSeed')(scope) === null) {
    return rbacProblem(context, RBAC_ERRORS.UNKNOWN_SCOPE, 422, 'Unprocessable Entity', 'Scope is not an active seed slug.')
  }

  const actor = await resolveEffectivePermissions(context)
  if (!hasPermission(actor, 'manage_users', scope)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.FORBIDDEN,
      403,
      'Forbidden',
      `Inviting on scope '${scope}' requires 'manage_users' on that scope.`,
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

  const now = context.get('clock').nowSeconds()
  await context.get('invitationRepository').invalidatePending(email, now)

  const token = generateOpaqueToken()
  const tokenHash = await sha256hex(token)
  const expiresAt = now + INVITATION_TTL_SECONDS

  const id = await context.get('invitationRepository').create({
    email,
    tokenHash,
    roleId,
    scope,
    invitedBy: context.get('jwtPayload')?.sub ?? '',
    expiresAt,
  })

  const inviteUrl = buildInviteUrl(context, token)

  dispatchInvitationEmail(context, {
    to: email,
    inviteUrl,
    roleName: role.name,
    scope,
    locale: resolveEmailLocale(parsed.data.locale),
  })

  return context.json({ id, email, roleId, scope, expiresAt, inviteUrl }, 201)
}

/**
 * GET /api/rbac/invitations
 * Visibility is scope-gated the same way as any other administration listing: a scoped
 * `manage_users` holder must not enumerate invitations outside their perimeter.
 */
export const listInvitationsHandler = async (context: AppContext) => {
  const now = context.get('clock').nowSeconds()
  const rows = await context.get('invitationRepository').listAll()
  const roles = await context.get('roleRepository').findByIds([...new Set(rows.map(row => row.roleId))])
  const roleById = new Map(roles.map(role => [role.id, role]))

  const actor = await resolveEffectivePermissions(context)
  const visible = rows.filter(row => hasPermission(actor, 'manage_users', row.scope))

  return context.json({
    invitations: visible.map(row => ({
      id: row.id,
      email: row.email,
      roleId: row.roleId,
      roleName: roleById.get(row.roleId)?.name ?? null,
      scope: row.scope,
      invitedBy: row.invitedBy,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      status: row.usedAt !== null ? 'accepted' : row.expiresAt <= now ? 'expired' : 'pending',
    })),
  })
}

/**
 * POST /api/rbac/invitations/:invitationId/regenerate
 * Re-runs both authorization checks against the row's OWN (role, scope): the caller
 * regenerating may differ from the issuer, and the role's permissions may have changed.
 */
export const regenerateInvitationHandler = async (context: AppContext) => {
  const invitationId = context.req.param('invitationId')
  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such invitation.')
  if (!context.get('idGenerator').isValid(invitationId)) return notFound()

  const invitationRepository = context.get('invitationRepository')
  const row = await invitationRepository.findById(invitationId)
  if (!row) return notFound()

  if (row.usedAt !== null) {
    return rbacProblem(
      context,
      RBAC_ERRORS.INVITATION_ALREADY_USED,
      409,
      'Conflict',
      'A consumed invitation cannot be regenerated; issue a new one.',
    )
  }

  const role = await context.get('roleRepository').findById(row.roleId)
  if (!role) return notFound()

  if (row.scope !== GLOBAL_SCOPE && context.get('getSeed')(row.scope) === null) {
    return rbacProblem(context, RBAC_ERRORS.UNKNOWN_SCOPE, 422, 'Unprocessable Entity', 'Scope is not an active seed slug.')
  }

  const actor = await resolveEffectivePermissions(context)
  if (!hasPermission(actor, 'manage_users', row.scope)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.FORBIDDEN,
      403,
      'Forbidden',
      `Regenerating on scope '${row.scope}' requires 'manage_users' on that scope.`,
    )
  }
  if (!canGrant(actor, row.scope, role.permissions)) {
    return rbacProblem(
      context,
      RBAC_ERRORS.ESCALATION_REFUSED,
      403,
      'Forbidden',
      'The role carries permissions the caller does not hold on this scope.',
    )
  }

  const now = context.get('clock').nowSeconds()
  const token = generateOpaqueToken()
  const tokenHash = await sha256hex(token)
  const expiresAt = now + INVITATION_TTL_SECONDS

  const regenerated = await invitationRepository.regenerate(invitationId, tokenHash, expiresAt)
  if (!regenerated) {
    return rbacProblem(
      context,
      RBAC_ERRORS.INVITATION_ALREADY_USED,
      409,
      'Conflict',
      'A consumed invitation cannot be regenerated; issue a new one.',
    )
  }

  const inviteUrl = buildInviteUrl(context, token)

  dispatchInvitationEmail(context, {
    to: row.email,
    inviteUrl,
    roleName: role.name,
    scope: row.scope,
    locale: resolveEmailLocale(undefined),
  })

  return context.json({ id: invitationId, expiresAt, inviteUrl })
}

/**
 * DELETE /api/rbac/invitations/:invitationId
 * 404, not 403, when the caller lacks authority on the row's scope — same
 * enumeration-oracle reasoning as `deleteAssignmentHandler`.
 */
export const revokeInvitationHandler = async (context: AppContext) => {
  const invitationId = context.req.param('invitationId')
  const notFound = () => rbacProblem(context, RBAC_ERRORS.NOT_FOUND, 404, 'Not Found', 'No such invitation.')
  if (!context.get('idGenerator').isValid(invitationId)) return notFound()

  const invitationRepository = context.get('invitationRepository')
  const row = await invitationRepository.findById(invitationId)
  if (!row) return notFound()

  const actor = await resolveEffectivePermissions(context)
  if (!hasPermission(actor, 'manage_users', row.scope)) return notFound()

  const deleted = await invitationRepository.delete(invitationId)
  if (!deleted) return notFound()
  return context.body(null, 204)
}
