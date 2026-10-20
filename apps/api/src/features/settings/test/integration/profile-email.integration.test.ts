// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

// Account writes must reject every address login rejects, before changing persisted state.
const invalidEmails = ['admin@example..com', 'admin@.example.com', 'admin@example.com.', `${'a'.repeat(244)}@beech.test`]
// Login's existing limit is 254 characters, including the 11-character domain suffix.
const validEmails = [CANONICAL_USERS.viewer.email, `${'a'.repeat(243)}@beech.test`]

describe('settings slice — integration (real D1)', () => {
  let harness: TestHarness
  let editor: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // The harness inserts users only if absent; reset changed emails and sessions between cases.
    await env.DB.prepare('DELETE FROM users').run()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    editor = await harness.asUser('editor')
  })

  it.each(invalidEmails)('rejects profile address %s and keeps the entire profile unchanged', async (email) => {
    const payload = { email, name: 'Changed name' }

    const response = await editor.put('/api/settings/profile', payload)

    expect(response.status).toBe(400)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'bad-request' })

    const user = await harness.db.prepare('SELECT email, name FROM users WHERE id = ?')
      .bind(CANONICAL_USERS.editor.id).first<{ email: string; name: string }>()
    expect(user).toEqual({ email: CANONICAL_USERS.editor.email, name: CANONICAL_USERS.editor.name })
  })

  it.each(validEmails)('logs in after updating the profile address to %s', async (email) => {
    // The viewer address is the replacement, so release its canonical account first.
    await harness.db.prepare('DELETE FROM users WHERE id = ?').bind(CANONICAL_USERS.viewer.id).run()
    const updated = await editor.put('/api/settings/profile', { email: `  ${email.toUpperCase()}  ` })
    expect(updated.status).toBe(200)

    const response = await harness.anonymous().post('/auth/login', { email, password: CANONICAL_USERS.editor.password })

    expect(response.status).toBe(200)
    expect(await response.json<{ token: string }>()).toMatchObject({ token: expect.any(String) })

    const user = await harness.db.prepare('SELECT email FROM users WHERE id = ?')
      .bind(CANONICAL_USERS.editor.id).first<{ email: string }>()
    expect(user).toEqual({ email })
    expect(await harness.db.prepare('SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = ?')
      .bind(CANONICAL_USERS.editor.id).first<{ n: number }>()).toEqual({ n: 1 })
  })
})
