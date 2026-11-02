// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Automations slice — CRUD routes, integration tier. Covers `/api/automations` through the full
 * middleware chain against real D1: what each route persists, and the order its checks run in
 * (unknown id before body, body malformed before body invalid). Running automations is covered by
 * the cron-runner and set-variable suites next to this one.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface ProblemBody {
  type: string
  status: number
}

interface AutomationRow {
  id: string
  seed_slug: string
  name: string
  enabled: number
  trigger_conditions: string | null
}

const validBody = {
  seed_slug: 'posts',
  name: 'notify-on-create',
  triggers: [{ event: 'create' }],
  actions: [{ type: 'webhook', url: 'https://example.com/hook', body_template: '{}' }],
}

describe('automations slice — CRUD (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  async function createAutomation(body: object = validBody): Promise<string> {
    const response = await admin.post('/api/automations', body)
    return (await response.json<{ id: string }>()).id
  }

  async function rowOf(id: string): Promise<AutomationRow | null> {
    return harness.db
      .prepare('SELECT id, seed_slug, name, enabled, trigger_conditions FROM automations WHERE id = ?')
      .bind(id)
      .first<AutomationRow>()
  }

  async function automationCount(): Promise<number> {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM automations').first<{ n: number }>()
    return row?.n ?? 0
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // The harness resets content tables only; `automations` outlives a single test.
    await harness.db.prepare('DELETE FROM automations').run()
  })

  describe('POST /api/automations', () => {
    it('creates the automation enabled and without conditions, and answers its id', async () => {
      const response = await admin.post('/api/automations', validBody)

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()
      expect(await rowOf(id)).toEqual({
        id,
        seed_slug: 'posts',
        name: 'notify-on-create',
        enabled: 1,
        trigger_conditions: null,
      })
    })

    it('answers 400 invalid-json for a body that is not JSON and stores nothing', async () => {
      const response = await admin.request('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })

      expect(response.status).toBe(400)
      expect((await response.json<ProblemBody>()).type).toContain('invalid-json')
      expect(await automationCount()).toBe(0)
    })

    it('answers 400 automation-validation-failed for JSON that misses the required fields and stores nothing', async () => {
      const response = await admin.post('/api/automations', { seed_slug: 'posts' })

      expect(response.status).toBe(400)
      expect((await response.json<ProblemBody>()).type).toContain('automation-validation-failed')
      expect(await automationCount()).toBe(0)
    })
  })

  describe('GET /api/automations', () => {
    it('lists only the automations of the requested seed', async () => {
      const postsId = await createAutomation()
      await createAutomation({ ...validBody, seed_slug: 'authors', name: 'other-seed' })

      const response = await admin.get('/api/automations?seed=posts')

      expect(response.status).toBe(200)
      const body = await response.json<Array<{ id: string; seed_slug: string }>>()
      expect(body.map((automation) => automation.id)).toEqual([postsId])
    })

    it.each(['/api/automations', '/api/automations?seed='])('answers 400 missing-seed for %s', async (path) => {
      const response = await admin.get(path)

      expect(response.status).toBe(400)
      expect((await response.json<ProblemBody>()).type).toContain('missing-seed')
    })
  })

  describe('GET /api/automations/:id', () => {
    it('answers the stored automation', async () => {
      const id = await createAutomation()

      const response = await admin.get(`/api/automations/${id}`)

      expect(response.status).toBe(200)
      expect(await response.json<{ id: string; name: string; enabled: boolean }>()).toMatchObject({
        id,
        name: 'notify-on-create',
        enabled: true,
      })
    })

    it('answers 404 automation-not-found for an unknown id', async () => {
      const response = await admin.get('/api/automations/missing')

      expect(response.status).toBe(404)
      expect((await response.json<ProblemBody>()).type).toContain('automation-not-found')
    })
  })

  describe('PUT /api/automations/:id', () => {
    it('persists the fields it was given and leaves the rest', async () => {
      const id = await createAutomation()

      const response = await admin.put(`/api/automations/${id}`, { name: 'renamed' })

      expect(response.status).toBe(204)
      expect(await rowOf(id)).toMatchObject({ name: 'renamed', seed_slug: 'posts', enabled: 1 })
    })

    it('answers 404 automation-not-found before reading the body, even when it is not JSON', async () => {
      const response = await admin.request('/api/automations/missing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })

      expect(response.status).toBe(404)
      expect((await response.json<ProblemBody>()).type).toContain('automation-not-found')
    })

    it('answers 400 automation-validation-failed for an invalid value and keeps the stored name', async () => {
      const id = await createAutomation()

      const response = await admin.put(`/api/automations/${id}`, { name: 12345 })

      expect(response.status).toBe(400)
      expect((await response.json<ProblemBody>()).type).toContain('automation-validation-failed')
      expect((await rowOf(id))?.name).toBe('notify-on-create')
    })
  })

  describe('PATCH /api/automations/:id/toggle', () => {
    it('flips enabled and persists it', async () => {
      const id = await createAutomation()

      const response = await admin.patch(`/api/automations/${id}/toggle`, { enabled: false })

      expect(response.status).toBe(204)
      expect((await rowOf(id))?.enabled).toBe(0)
    })

    it('answers 404 automation-not-found before reading the body, even when it is not JSON', async () => {
      const response = await admin.request('/api/automations/missing/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })

      expect(response.status).toBe(404)
      expect((await response.json<ProblemBody>()).type).toContain('automation-not-found')
    })

    it('answers 400 automation-validation-failed for a non-boolean enabled and leaves it on', async () => {
      const id = await createAutomation()

      const response = await admin.patch(`/api/automations/${id}/toggle`, { enabled: 'no' })

      expect(response.status).toBe(400)
      expect((await response.json<ProblemBody>()).type).toContain('automation-validation-failed')
      expect((await rowOf(id))?.enabled).toBe(1)
    })
  })

  describe('DELETE /api/automations/:id', () => {
    it('removes the automation', async () => {
      const id = await createAutomation()

      const response = await admin.delete(`/api/automations/${id}`)

      expect(response.status).toBe(204)
      expect(await rowOf(id)).toBeNull()
    })

    it('answers 404 automation-not-found for an unknown id and removes nothing', async () => {
      const id = await createAutomation()

      const response = await admin.delete('/api/automations/missing')

      expect(response.status).toBe(404)
      expect((await response.json<ProblemBody>()).type).toContain('automation-not-found')
      expect(await rowOf(id)).not.toBeNull()
    })
  })
})
