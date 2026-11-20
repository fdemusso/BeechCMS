// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Settings slice — UI preferences integration tier. Covers the per-user container's contract
 * (replace semantics, closed keys, caps) and its isolation between accounts against real D1.
 * The unauthenticated refusal and the routes' registration are covered by the fail-closed route
 * table and its completeness test (permission.middleware.test.ts), not here.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const PATH = '/api/settings/ui-preferences'
const PINS = ['nav:/content', 'content:open:posts']

type StoredColumns = { ui_prefs: string; notification_prefs: string }
type PinsBody = { palettePins: string[] }
type RefusalBody = { type: string; keys?: string[] }

describe('settings slice — UI preferences (real D1)', () => {
  let harness: TestHarness

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    // The harness seeds users with INSERT OR IGNORE, so rows (and their containers) outlive a test.
    await env.DB.prepare("UPDATE users SET ui_prefs = '{}'").run()
  })

  const readColumns = (userId: string) =>
    harness.db
      .prepare('SELECT ui_prefs, notification_prefs FROM users WHERE id = ?')
      .bind(userId)
      .first<StoredColumns>()

  describe('GET /api/settings/ui-preferences', () => {
    it('a user who never wrote the container reads an empty pin list', async () => {
      const editor = await harness.asUser('editor')

      const response = await editor.get(PATH)

      expect(response.status).toBe(200)
      expect(await response.json<PinsBody>()).toEqual({ palettePins: [] })
    })

    it('a corrupt stored value reads as the empty container', async () => {
      // Simulates a value written outside the API; GET must never answer 500 because of it.
      const editor = await harness.asUser('editor')
      await harness.db.prepare("UPDATE users SET ui_prefs = 'not json' WHERE id = ?").bind(CANONICAL_USERS.editor.id).run()

      const response = await editor.get(PATH)

      expect(response.status).toBe(200)
      expect(await response.json<PinsBody>()).toEqual({ palettePins: [] })
    })
  })

  describe('PUT /api/settings/ui-preferences', () => {
    it('a viewer writes the container and the column holds exactly its JSON', async () => {
      // The viewer has no RBAC assignment: being authenticated is enough.
      const viewer = await harness.asUser('viewer')

      const response = await viewer.put(PATH, { palettePins: PINS })

      expect(response.status).toBe(200)
      expect(await response.json<PinsBody>()).toEqual({ palettePins: PINS })
      const row = await readColumns(CANONICAL_USERS.viewer.id)
      expect(row?.ui_prefs).toBe(JSON.stringify({ palettePins: PINS }))
    })

    it('a write leaves notification_prefs unchanged', async () => {
      // Regression guard: the two containers must never mix.
      const editor = await harness.asUser('editor')
      const before = await readColumns(CANONICAL_USERS.editor.id)

      const response = await editor.put(PATH, { palettePins: PINS })

      expect(response.status).toBe(200)
      const after = await readColumns(CANONICAL_USERS.editor.id)
      expect(after?.notification_prefs).toBe(before?.notification_prefs)
    })

    it('a body that omits palettePins clears the pins', async () => {
      const editor = await harness.asUser('editor')
      await editor.put(PATH, { palettePins: PINS })

      const response = await editor.put(PATH, {})

      expect(response.status).toBe(200)
      expect(await response.json<PinsBody>()).toEqual({ palettePins: [] })
      const row = await readColumns(CANONICAL_USERS.editor.id)
      expect(row?.ui_prefs).toBe('{"palettePins":[]}')
    })

    it("the admin's write is invisible to the editor", async () => {
      const admin = await harness.asUser('admin')
      const editor = await harness.asUser('editor')
      await admin.put(PATH, { palettePins: PINS })

      const response = await editor.get(PATH)

      expect(response.status).toBe(200)
      expect(await response.json<PinsBody>()).toEqual({ palettePins: [] })
      const row = await readColumns(CANONICAL_USERS.editor.id)
      expect(row?.ui_prefs).toBe('{}')
    })

    const refusals: ReadonlyArray<readonly [string, string, unknown]> = [
      ['an unknown key', 'ui-preferences-unknown-key', { theme: 'dark' }],
      ['nine pins', 'ui-preferences-invalid', { palettePins: Array.from({ length: 9 }, (_, index) => `nav:${index}`) }],
      [
        'an over-size container',
        'ui-preferences-too-large',
        { palettePins: Array.from({ length: 8 }, (_, index) => `${index}${'é'.repeat(199)}`) },
      ],
    ]

    it.each(refusals)('%s answers 400 %s and the stored container is unchanged', async (_cause, code, body) => {
      const editor = await harness.asUser('editor')
      await editor.put(PATH, { palettePins: PINS })
      const before = await readColumns(CANONICAL_USERS.editor.id)

      const response = await editor.put(PATH, body)

      expect(response.status).toBe(400)
      expect((await response.json<RefusalBody>()).type).toBe(code)
      const after = await readColumns(CANONICAL_USERS.editor.id)
      expect(after?.ui_prefs).toBe(before?.ui_prefs)
      expect(after?.ui_prefs).toBe(JSON.stringify({ palettePins: PINS }))
    })
  })
})
