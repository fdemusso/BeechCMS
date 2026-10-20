// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Settings slice — password change integration tier. Covers PUT /api/settings/password against
 * real D1: a successful change must invalidate every existing refresh session of the user, and
 * a rejected change must leave both the hash and the sessions untouched.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const FAR_FUTURE = 4_102_444_800 // 2100-01-01

describe('settings slice — password change (real D1)', () => {
  let harness: TestHarness
  let editor: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    editor = await harness.asUser('editor')
    // Users outlive a single test (provisioning is INSERT OR IGNORE), so restore the canonical hash.
    await harness.db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(CANONICAL_USERS.editor.passwordHash, CANONICAL_USERS.editor.id)
      .run()
    await harness.db.prepare('DELETE FROM refresh_tokens').run()
    await harness.db
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('session-a', CANONICAL_USERS.editor.id, 'hash-a', FAR_FUTURE, 1)
      .run()
    await harness.db
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('session-other-user', CANONICAL_USERS.viewer.id, 'hash-b', FAR_FUTURE, 1)
      .run()
  })

  async function revokedAt(sessionId: string): Promise<number | null | undefined> {
    const row = await harness.db
      .prepare('SELECT revoked_at FROM refresh_tokens WHERE id = ?')
      .bind(sessionId)
      .first<{ revoked_at: number | null }>()
    return row?.revoked_at
  }

  it('revokes the refresh sessions of the user and stores the new hash', async () => {
    const response = await editor.put('/api/settings/password', {
      currentPassword: CANONICAL_USERS.editor.password,
      newPassword: 'a-brand-new-password',
    })

    expect(response.status).toBe(200)
    expect(await revokedAt('session-a')).not.toBeNull()
    const user = await harness.db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(CANONICAL_USERS.editor.id)
      .first<{ password_hash: string }>()
    expect(user?.password_hash).not.toBe(CANONICAL_USERS.editor.passwordHash)
  })

  it('leaves the sessions of other users active', async () => {
    await editor.put('/api/settings/password', {
      currentPassword: CANONICAL_USERS.editor.password,
      newPassword: 'a-brand-new-password',
    })

    expect(await revokedAt('session-other-user')).toBeNull()
  })

  it('keeps sessions and hash untouched when the current password is wrong', async () => {
    const response = await editor.put('/api/settings/password', {
      currentPassword: 'not-the-password',
      newPassword: 'a-brand-new-password',
    })

    expect(response.status).toBe(401)
    expect(await revokedAt('session-a')).toBeNull()
    const user = await harness.db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(CANONICAL_USERS.editor.id)
      .first<{ password_hash: string }>()
    expect(user?.password_hash).toBe(CANONICAL_USERS.editor.passwordHash)
  })
})
