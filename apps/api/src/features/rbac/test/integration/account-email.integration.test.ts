// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'

// Account writes must reject every address login rejects, before changing persisted state.
const invalidEmails = ['admin@example..com', 'admin@.example.com', 'admin@example.com.', `${'a'.repeat(244)}@beech.test`]
// Login's existing limit is 254 characters, including the 11-character domain suffix.
const validEmails = [CANONICAL_USERS.viewer.email, `${'a'.repeat(243)}@beech.test`]

describe('rbac slice — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let roleId: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Account and invitation writes outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM users').run()
    harness = await createTestHarness({
      db: env.DB,
      users: [CANONICAL_USERS.admin],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    const role = await harness.db.prepare('SELECT id FROM roles WHERE name = ?')
      .bind(SUPER_ADMIN_ROLE_NAME).first<{ id: string }>()
    expect(role).not.toBeNull()
    roleId = role!.id
  })

  it.each(invalidEmails)('rejects account address %s without creating a user', async (email) => {
    const payload = { email, password: CANONICAL_USERS.viewer.password }

    const response = await admin.post('/api/rbac/users', payload)

    expect(response.status).toBe(422)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/validation-failed' })

    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 1 })
  })

  it.each(invalidEmails)('rejects invitation address %s without storing an invitation', async (email) => {
    const payload = { email, roleId, scope: GLOBAL_SCOPE }

    const response = await admin.post('/api/rbac/invitations', payload)

    expect(response.status).toBe(422)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/validation-failed' })

    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM invitations').first<{ n: number }>()).toEqual({ n: 0 })
    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 1 })
  })

  it.each(invalidEmails)('rejects a stored invitation for %s without consuming it or creating an account', async (email) => {
    const issued = await admin.post('/api/rbac/invitations', { email: CANONICAL_USERS.viewer.email, roleId, scope: GLOBAL_SCOPE })
    expect(issued.status).toBe(201)
    const { id, inviteUrl } = await issued.json<{ id: string; inviteUrl: string }>()
    const token = new URL(inviteUrl).searchParams.get('token')
    // Older validators already stored addresses login rejects; acceptance must gate those too.
    await harness.db.prepare('UPDATE invitations SET email = ? WHERE id = ?').bind(email, id).run()

    const response = await harness.anonymous().post('/auth/invitations/accept', { token, password: CANONICAL_USERS.viewer.password })

    expect(response.status).toBe(422)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/validation-failed' })

    expect(await harness.db.prepare('SELECT used_at FROM invitations WHERE id = ?').bind(id)
      .first<{ used_at: number | null }>()).toEqual({ used_at: null })
    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).toEqual({ n: 1 })
  })

  it.each(validEmails)('logs in with the normalized created account address %s', async (email) => {
    const created = await admin.post('/api/rbac/users', { email: `  ${email.toUpperCase()}  `, password: CANONICAL_USERS.viewer.password })
    expect(created.status).toBe(201)

    const response = await harness.anonymous().post('/auth/login', { email, password: CANONICAL_USERS.viewer.password })

    expect(response.status).toBe(200)
    expect(await response.json<{ token: string }>()).toMatchObject({ token: expect.any(String) })

    expect(await harness.db.prepare('SELECT email FROM users WHERE email = ?').bind(email).first<{ email: string }>()).toEqual({ email })
    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM refresh_tokens').first<{ n: number }>()).toEqual({ n: 1 })
  })

  it.each(validEmails)('logs in with the normalized accepted invitation address %s', async (email) => {
    const issued = await admin.post('/api/rbac/invitations', { email: `  ${email.toUpperCase()}  `, roleId, scope: GLOBAL_SCOPE })
    expect(issued.status).toBe(201)
    const { id, inviteUrl } = await issued.json<{ id: string; inviteUrl: string }>()
    const token = new URL(inviteUrl).searchParams.get('token')
    const accepted = await harness.anonymous().post('/auth/invitations/accept', { token, password: CANONICAL_USERS.viewer.password })
    expect(accepted.status).toBe(201)

    const response = await harness.anonymous().post('/auth/login', { email, password: CANONICAL_USERS.viewer.password })

    expect(response.status).toBe(200)
    expect(await response.json<{ token: string }>()).toMatchObject({ token: expect.any(String) })

    expect(await harness.db.prepare('SELECT email FROM users WHERE email = ?').bind(email).first<{ email: string }>()).toEqual({ email })
    expect(await harness.db.prepare('SELECT used_at FROM invitations WHERE id = ?').bind(id)
      .first<{ used_at: number | null }>()).toEqual({ used_at: expect.any(Number) })
  })
})
