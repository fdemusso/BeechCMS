// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — bulk validation integration tier. Bulk 'set' writes must pass the same
 * type, required and richtext-sanitizing gate as PUT /:slug/:id, and a rejected request
 * must leave every row untouched.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

let counter = 0

describe('content slice — bulk validation (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let slug: string
  let id: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    slug = `bulk_validation_${counter++}` // seeds outlive each test
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')

    const seed = await admin.post('/api/seeds', {
      slug,
      label: slug,
      branches: [
        { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
        { alias: 'body', label: 'Body', type: 'richtext' },
        { alias: 'score', label: 'Score', type: 'number' },
      ],
    })
    expect(seed.status).toBe(201) // precondition

    const created = await admin.post(`/api/content/${slug}`, { title: 'Original', slug: 'original', body: '<p>ok</p>', score: 1 })
    expect(created.status).toBe(201) // precondition
    id = (await created.json<{ id: string }>()).id
  })

  async function rawRow(): Promise<{ title: string; body: string | null; score: number | null }> {
    return (await harness.db
      .prepare(`SELECT title, body, score FROM content_${slug} WHERE id = ?`)
      .bind(id)
      .first<{ title: string; body: string | null; score: number | null }>())!
  }

  describe('PATCH /api/content/:slug/bulk', () => {
    it('rejects dangerous richtext with 422 and writes nothing', async () => {
      const before = await rawRow()

      const response = await admin.patch(`/api/content/${slug}/bulk`, {
        ids: [id],
        fields: { body: '<script>alert(1)</script>' },
      })

      expect(response.status).toBe(422)
      expect((await response.json<{ type: string }>()).type).toContain('content-dangerous-content')
      expect(await rawRow()).toEqual(before)
    })

    it('rejects a string written into a number field with 400 and writes nothing', async () => {
      const before = await rawRow()

      const response = await admin.patch(`/api/content/${slug}/bulk`, {
        ids: [id],
        fields: { score: 'not-a-number' },
      })

      expect(response.status).toBe(400)
      expect(await rawRow()).toEqual(before)
    })

    it('rejects null on a required field with 400 and writes nothing', async () => {
      const before = await rawRow()

      const response = await admin.patch(`/api/content/${slug}/bulk`, {
        ids: [id],
        fields: { title: null },
      })

      expect(response.status).toBe(400)
      expect(await rawRow()).toEqual(before)
    })

    it('persists a valid value', async () => {
      const response = await admin.patch(`/api/content/${slug}/bulk`, {
        ids: [id],
        fields: { score: 7 },
      })

      expect(response.status).toBe(200)
      expect((await rawRow()).score).toBe(7)
    })
  })
})
