// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Invitation HTTP handlers — unit tier with mocked storage boundaries.
 * Real D1 persistence and login parity are covered by account-email.integration.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { IInvitationRepository, IRoleRepository, IRoleAssignmentRepository, IUserRepository, RoleRecord, ValidatedInvitation, UserRecord, RateLimitResult } from '@beechcms/core'
import { CANONICAL_USERS, FixedClock } from '@beechcms/testing'
import { SystemIdGenerator } from '@beechcms/core'
import type { Env, Variables } from '../../types'
import { acceptInvitationHandler, previewInvitationHandler } from './invitations.public'

const invitations = {
  invalidatePending: vi.fn<IInvitationRepository['invalidatePending']>(),
  create: vi.fn<IInvitationRepository['create']>(),
  findValidByHash: vi.fn<IInvitationRepository['findValidByHash']>(),
  markUsed: vi.fn<IInvitationRepository['markUsed']>(),
  findById: vi.fn<IInvitationRepository['findById']>(),
  listAll: vi.fn<IInvitationRepository['listAll']>(),
  regenerate: vi.fn<IInvitationRepository['regenerate']>(),
  delete: vi.fn<IInvitationRepository['delete']>(),
}

const roles = {
  findById: vi.fn<IRoleRepository['findById']>(),
  findByIds: vi.fn<IRoleRepository['findByIds']>(),
  listAll: vi.fn<IRoleRepository['listAll']>(),
  create: vi.fn<IRoleRepository['create']>(),
  update: vi.fn<IRoleRepository['update']>(),
  delete: vi.fn<IRoleRepository['delete']>(),
}

const assignments = {
  listActiveForUser: vi.fn<IRoleAssignmentRepository['listActiveForUser']>(),
  listByRole: vi.fn<IRoleAssignmentRepository['listByRole']>(),
  create: vi.fn<IRoleAssignmentRepository['create']>(),
  delete: vi.fn<IRoleAssignmentRepository['delete']>(),
  countActiveGlobalAdmins: vi.fn<IRoleAssignmentRepository['countActiveGlobalAdmins']>(),
  findById: vi.fn<IRoleAssignmentRepository['findById']>(),
  listAll: vi.fn<IRoleAssignmentRepository['listAll']>(),
  listAllForUser: vi.fn<IRoleAssignmentRepository['listAllForUser']>(),
  countActiveGlobalAdminsExcludingUser: vi.fn<IRoleAssignmentRepository['countActiveGlobalAdminsExcludingUser']>(),
  countActiveGlobalAdminsExcludingRole: vi.fn<IRoleAssignmentRepository['countActiveGlobalAdminsExcludingRole']>(),
}

const users = {
  countAll: vi.fn<IUserRepository['countAll']>(),
  findById: vi.fn<IUserRepository['findById']>(),
  findByEmail: vi.fn<IUserRepository['findByEmail']>(),
  create: vi.fn<IUserRepository['create']>(),
  createInitialAdmin: vi.fn<IUserRepository['createInitialAdmin']>(),
  updateProfile: vi.fn<IUserRepository['updateProfile']>(),
  updatePasswordHash: vi.fn<IUserRepository['updatePasswordHash']>(),
  changePasswordAndRevokeSessions: vi.fn<IUserRepository['changePasswordAndRevokeSessions']>(),
  updateAvatarUrl: vi.fn<IUserRepository['updateAvatarUrl']>(),
  updateNotificationPreferences: vi.fn<IUserRepository['updateNotificationPreferences']>(),
  emailBelongsToAnotherUser: vi.fn<IUserRepository['emailBelongsToAnotherUser']>(),
  listAccounts: vi.fn<IUserRepository['listAccounts']>(),
  setActive: vi.fn<IUserRepository['setActive']>(),
}

const issuer: UserRecord = {
  ...CANONICAL_USERS.admin, surname: null, avatarUrl: null, notificationPreferences: '{}', isActive: true,
}
const role: RoleRecord = {
  id: CANONICAL_USERS.editor.id, name: 'Invitation role', description: null,
  isSystem: false, permissions: ['manage_users', 'content:read'], createdAt: 0, updatedAt: 0,
}
const invitation: ValidatedInvitation = {
  id: CANONICAL_USERS.viewer.id, email: CANONICAL_USERS.viewer.email, roleId: role.id,
  scope: '*', invitedBy: issuer.id,
}
const limiter = { checkLimit: vi.fn<(key: string) => Promise<RateLimitResult>>() }
const hashProvider = {
  hash: vi.fn<(password: string) => Promise<string>>(),
  verify: vi.fn<(password: string, hash: string) => Promise<boolean>>(),
}
const clock = new FixedClock(Date.UTC(2026, 0, 1))

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (context, next) => {
    context.set('clock', clock)
    context.set('idGenerator', SystemIdGenerator)
    context.set('hashProvider', hashProvider)
    context.set('invitationRepository', invitations)
    context.set('roleRepository', roles)
    context.set('roleAssignmentRepository', assignments)
    context.set('userRepository', users)
    context.set('rateLimiters', { getLimiter: () => limiter })
    context.set('getSeed', () => null)
    await next()
  })
  app.get('/auth/invitations/:token', previewInvitationHandler)
  app.post('/auth/invitations/accept', acceptInvitationHandler)
  return app
}

describe('invitation HTTP handlers', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(() => {
    vi.resetAllMocks()
    limiter.checkLimit.mockResolvedValue({ isAllowed: true })
    invitations.findValidByHash.mockResolvedValue(invitation)
    invitations.markUsed.mockResolvedValue(true)
    roles.findById.mockResolvedValue(role)
    roles.findByIds.mockResolvedValue([role])
    users.findById.mockResolvedValue(issuer)
    users.findByEmail.mockResolvedValue(null)
    users.create.mockResolvedValue(undefined)
    assignments.listActiveForUser.mockResolvedValue([
      { id: issuer.id, userId: issuer.id, roleId: role.id, scope: '*' },
    ])
    hashProvider.hash.mockResolvedValue(CANONICAL_USERS.viewer.passwordHash)
    app = buildApp()
  })

  function accept(body: unknown = { token: 'invitation-token', password: CANONICAL_USERS.viewer.password }) {
    return app.request('/auth/invitations/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
  }

  it('previews a valid invitation without exposing its token hash', async () => {
    const response = await app.request('/auth/invitations/invitation-token')

    expect(response.status).toBe(200)
    expect(await response.json<{ email: string; roleName: string; scope: string }>())
      .toEqual({ email: invitation.email, roleName: role.name, scope: invitation.scope })
  })

  it.each(['unknown invitation', 'missing role'])('returns 404 when preview has an %s', async (reason) => {
    if (reason === 'unknown invitation') invitations.findValidByHash.mockResolvedValue(null)
    else roles.findById.mockResolvedValue(null)

    const response = await app.request('/auth/invitations/invitation-token')

    expect(response.status).toBe(404)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/invitation-invalid' })
  })

  it.each([undefined, 30])('rate limits preview and acceptance with retry interval %s', async (retryAfterSeconds) => {
    limiter.checkLimit.mockResolvedValue({ isAllowed: false, retryAfterSeconds })

    const responses = await Promise.all([app.request('/auth/invitations/invitation-token'), accept()])

    for (const response of responses) {
      expect(response.status).toBe(429)
      expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/too-many-requests' })
      expect(response.headers.get('Retry-After')).toBe(retryAfterSeconds === undefined ? null : String(retryAfterSeconds))
    }
  })

  // Legacy invitation email validation must happen before the single-use claim.
  const refusals: { reason: string; arrange: () => void; status: number; type: string }[] = [
    { reason: 'unknown invitation', arrange: () => { invitations.findValidByHash.mockResolvedValue(null) }, status: 404, type: 'invitation-invalid' },
    { reason: 'invalid stored email', arrange: () => { invitations.findValidByHash.mockResolvedValue({ ...invitation, email: 'admin@example..com' }) }, status: 422, type: 'validation-failed' },
    { reason: 'missing role', arrange: () => { roles.findById.mockResolvedValue(null) }, status: 404, type: 'invitation-invalid' },
    { reason: 'unknown scope', arrange: () => { invitations.findValidByHash.mockResolvedValue({ ...invitation, scope: 'unknown' }) }, status: 422, type: 'unknown-scope' },
    { reason: 'missing issuer', arrange: () => { users.findById.mockResolvedValue(null) }, status: 409, type: 'invitation-revoked' },
    { reason: 'inactive issuer', arrange: () => { users.findById.mockResolvedValue({ ...issuer, isActive: false }) }, status: 409, type: 'invitation-revoked' },
    { reason: 'revoked issuer authority', arrange: () => { assignments.listActiveForUser.mockResolvedValue([]) }, status: 409, type: 'invitation-revoked' },
    { reason: 'role exceeding issuer authority', arrange: () => { roles.findByIds.mockResolvedValue([{ ...role, permissions: ['manage_users'] }]) }, status: 409, type: 'invitation-revoked' },
    { reason: 'lost single-use claim', arrange: () => { invitations.markUsed.mockResolvedValue(false) }, status: 404, type: 'invitation-invalid' },
    { reason: 'existing account', arrange: () => { users.findByEmail.mockResolvedValue(issuer) }, status: 409, type: 'email-taken' },
    { reason: 'concurrent account creation', arrange: () => { users.create.mockRejectedValue(new Error('UNIQUE constraint failed: users.email')) }, status: 409, type: 'email-taken' },
  ]

  it.each(refusals)('refuses acceptance for $reason with $status $type', async ({ arrange, status, type }) => {
    arrange()

    const response = await accept()

    expect(response.status).toBe(status)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: `https://beechcms.dev/problems/${type}` })
  })

  it('rejects malformed JSON with 400 invalid-json', async () => {
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }

    const response = await app.request('/auth/invitations/accept', init)

    expect(response.status).toBe(400)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/invalid-json' })
  })

  it('rejects invalid acceptance credentials with 422 validation-failed', async () => {
    const body = { token: 'invitation-token', password: 'short' }

    const response = await accept(body)

    expect(response.status).toBe(422)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/validation-failed' })
  })

  it.each([{}, { name: CANONICAL_USERS.viewer.name, surname: 'Viewer' }])('accepts a valid invitation with optional profile %j', async (profile) => {
    const body = { token: 'invitation-token', password: CANONICAL_USERS.viewer.password, ...profile }

    const response = await accept(body)

    expect(response.status).toBe(201)
    expect(await response.json<{ id: string; email: string }>()).toMatchObject({ email: invitation.email, id: expect.any(String) })
  })

  it('returns an internal error when account storage fails unexpectedly', async () => {
    users.create.mockRejectedValue(new Error('Storage unavailable'))

    const response = await accept()

    expect(response.status).toBe(500)
  })
})
