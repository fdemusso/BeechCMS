// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { sha256hex } from '@beechcms/core'
import { createBeechApp } from '../src/factory'
import { D1TestDatabase } from './helpers/d1-test-database'
import { StaticContentRepository } from './mocks/static-content.repository'
import { TEST_SEEDS, TEST_ENV } from './fixtures'

describe('Flow: RBAC invitations lifecycle', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    app = createBeechApp({ seeds: TEST_SEEDS, repository: new StaticContentRepository(TEST_SEEDS) })
    await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()
  })

  async function login(email: string) {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const body = await res.json<{ token: string }>()
    return body.token
  }

  async function authed(path: string, token: string, init: RequestInit = {}) {
    return app.request(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })
  }

  async function anon(path: string, init: RequestInit = {}) {
    return app.request(path, init, { ...TEST_ENV, DB: db })
  }

  /**
   * The plaintext token never leaves the API (it exists only inside the email), so the
   * test overwrites the persisted hash with one it controls and drives the flow through
   * a token it chose itself — same technique the sprint plan prescribes.
   */
  async function pinToken(invitationId: string, plaintext: string) {
    const hash = await sha256hex(plaintext)
    await db.prepare('UPDATE invitations SET token_hash = ? WHERE id = ?').bind(hash, invitationId).run()
  }

  it('issue -> preview -> accept -> login -> scope isolation -> single-use replay -> issuer revocation -> expiry + regenerate', async () => {
    // 1. Setup + SuperAdmin
    const setupRes = await app.request('/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'super@beech.local',
        password: 'password123',
        settings: { language: 'en', timezone: 'Europe/Rome', currency: 'EUR' },
        track: 'developer',
      }),
    }, { ...TEST_ENV, DB: db })
    expect(setupRes.status).toBe(201)
    const superToken = await login('super@beech.local')

    // 2. Role SeedEditor
    const roleRes = await authed('/api/rbac/roles', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SeedEditor', permissions: ['content:read', 'content:update'] }),
    })
    const { id: roleId } = await roleRes.json<{ id: string }>()

    // 3. Issue invitation at scope 'posts'
    const inviteRes = await authed('/api/rbac/invitations', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invitee@beech.local', roleId, scope: 'posts' }),
    })
    expect(inviteRes.status).toBe(201)
    const invitePayload = await inviteRes.json<{ id: string; email: string }>()
    expect(JSON.stringify(invitePayload)).not.toContain('token')

    const plainToken = 'test-plain-token-01'
    await pinToken(invitePayload.id, plainToken)

    // 4. Preview -> email, roleName, scope
    const previewRes = await anon(`/auth/invitations/${plainToken}`)
    expect(previewRes.status).toBe(200)
    expect(await previewRes.json()).toMatchObject({ email: 'invitee@beech.local', roleName: 'SeedEditor', scope: 'posts' })

    // 5. Accept -> 201, no token/session in the body
    const acceptRes = await anon('/auth/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: plainToken, password: 'password123' }),
    })
    expect(acceptRes.status).toBe(201)
    const accepted = await acceptRes.json<{ id: string; email: string }>()
    expect(accepted.email).toBe('invitee@beech.local')

    // 6. The new account logs in and reaches only its granted scope.
    const inviteeToken = await login('invitee@beech.local')
    expect((await authed('/api/content/posts', inviteeToken)).status).toBe(200)
    expect((await authed('/api/content/pages', inviteeToken)).status).toBe(403)

    // 7. Redeemed account is minted 'editor', never 'admin'.
    const inviteeRow = await db.prepare('SELECT role FROM users WHERE email = ?').bind('invitee@beech.local').first<{ role: string }>()
    expect(inviteeRow?.role).toBe('editor')

    // 8. Replay with the same token -> 404 invitation-invalid (single-use).
    const replayRes = await anon('/auth/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: plainToken, password: 'password123' }),
    })
    expect(replayRes.status).toBe(404)
    expect(await replayRes.json()).toMatchObject({ type: expect.stringContaining('invitation-invalid') })

    // 9. Issuer revocation: issue a second invite, then strip the issuer's authority.
    const secondInviteRes = await authed('/api/rbac/invitations', superToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invitee2@beech.local', roleId, scope: 'posts' }),
    })
    const secondInvite = await secondInviteRes.json<{ id: string }>()
    const secondToken = 'test-plain-token-02'
    await pinToken(secondInvite.id, secondToken)

    const superRow = await db.prepare('SELECT id FROM users WHERE email = ?').bind('super@beech.local').first<{ id: string }>()
    await db.prepare(`DELETE FROM user_role_assignments WHERE user_id = ? AND scope = '*'`).bind(superRow!.id).run()

    const revokedAcceptRes = await anon('/auth/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: secondToken, password: 'password123' }),
    })
    expect(revokedAcceptRes.status).toBe(409)
    expect(await revokedAcceptRes.json()).toMatchObject({ type: expect.stringContaining('invitation-revoked') })

    // 10. Expired invite: preview 404, then regenerate mints a working token.
    // Re-grant the SuperAdmin its global authority so it can regenerate.
    const superAdminRole = await db.prepare(`SELECT id FROM roles WHERE name = 'SuperAdmin'`).first<{ id: string }>()
    await db
      .prepare(`INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, '*')`)
      .bind('regen-superadmin-assignment', superRow!.id, superAdminRole!.id)
      .run()
    const superToken2 = await login('super@beech.local')

    const thirdInviteRes = await authed('/api/rbac/invitations', superToken2, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invitee3@beech.local', roleId, scope: 'posts' }),
    })
    const thirdInvite = await thirdInviteRes.json<{ id: string }>()
    await db.prepare('UPDATE invitations SET expires_at = 1 WHERE id = ?').bind(thirdInvite.id).run()

    const expiredToken = 'test-plain-token-03'
    await pinToken(thirdInvite.id, expiredToken)
    expect((await anon(`/auth/invitations/${expiredToken}`)).status).toBe(404)

    const regenerateRes = await authed(`/api/rbac/invitations/${thirdInvite.id}/regenerate`, superToken2, { method: 'POST' })
    expect(regenerateRes.status).toBe(200)

    const regeneratedToken = 'test-plain-token-03-regenerated'
    await pinToken(thirdInvite.id, regeneratedToken)
    const regeneratedPreviewRes = await anon(`/auth/invitations/${regeneratedToken}`)
    expect(regeneratedPreviewRes.status).toBe(200)
    expect(await regeneratedPreviewRes.json()).toMatchObject({ email: 'invitee3@beech.local', roleName: 'SeedEditor', scope: 'posts' })
  })
})
