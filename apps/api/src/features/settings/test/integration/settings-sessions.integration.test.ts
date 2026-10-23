// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Settings slice — active sessions integration tier. Covers GET /api/settings/sessions against
 * real D1: the response must use the snake_case timestamp keys the dashboard Security tab reads.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const FAR_FUTURE = 4_102_444_800 // 2100-01-01
const CREATED_AT = 1_791_204_532
const CLOCK_ONLY_EXPIRY = 1_780_000_000 // 2026-05-28

describe('settings slice — active sessions (real D1)', () => {
  let harness: TestHarness
  let editor: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    editor = await harness.asUser('editor')
    await harness.db.prepare('DELETE FROM refresh_tokens').run()
    await harness.db
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('session-a', CANONICAL_USERS.editor.id, 'hash-a', FAR_FUTURE, CREATED_AT)
      .run()
  })

  it('returns session timestamps under the snake_case keys read by the dashboard', async () => {
    const response = await editor.get('/api/settings/sessions')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: 'session-a', created_at: CREATED_AT, expires_at: FAR_FUTURE },
    ])
  })

  it('lists a session by the injected clock, not wall time', async () => {
    // Expires after the harness clock (2026-01-01) but before real wall time, so only the injected clock sees it as active.
    await harness.db
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('session-b', CANONICAL_USERS.editor.id, 'hash-b', CLOCK_ONLY_EXPIRY, CREATED_AT)
      .run()

    const response = await editor.get('/api/settings/sessions')

    expect(response.status).toBe(200)
    const sessions = await response.json<Array<{ id: string }>>()
    expect(sessions.map((session) => session.id)).toContain('session-b')
  })

  it('stamps revoked_at with the injected clock when a session is revoked', async () => {
    const response = await editor.delete('/api/settings/sessions/session-a')

    expect(response.status).toBe(200)
    const row = await harness.db
      .prepare('SELECT revoked_at FROM refresh_tokens WHERE id = ?')
      .bind('session-a')
      .first<{ revoked_at: number }>()
    expect(row?.revoked_at).toBe(harness.clock.nowSeconds())
  })
})
