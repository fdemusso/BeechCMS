// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — retype data-compatibility integration tier. Retype rebuilds a column with SQLite CAST,
 * which silently zeroes or truncates values that do not convert. The endpoint must refuse such a retype
 * with 422 and leave both the stored data and the seed definition untouched.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface SeedRecordBody {
  definition: { branches: Array<{ id: string; alias: string; type: string }> }
}

describe('seeds slice — retype compatibility (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  async function createSeedWithNotes(slug: string, notes: Array<string | null>) {
    await admin.post('/api/seeds', {
      slug,
      label: slug,
      branches: [
        { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
        { alias: 'note', label: 'Note', type: 'text', policies: { filter: false, search: false } },
      ],
    })
    for (const [i, note] of notes.entries()) {
      await harness.db
        .prepare(`INSERT INTO content_${slug} (id, slug, status, title, note, created_at, updated_at) VALUES (?, ?, 'published', 't', ?, 1, 1)`)
        .bind(`id_${i}`, `row-${i}`, note)
        .run()
    }
    const record = await (await admin.get(`/api/seeds/${slug}`)).json<SeedRecordBody>()
    const branch = record.definition.branches.find(b => b.alias === 'note')
    if (!branch) throw new Error('note branch not found')
    return branch.id
  }

  async function readNotes(slug: string) {
    const rs = await harness.db.prepare(`SELECT note FROM content_${slug} ORDER BY id`).all<{ note: unknown }>()
    return (rs.results ?? []).map(r => r.note)
  }

  it.each([
    ['non_numeric', 'non-numeric text', 'N/A'],
    ['prefix', 'numeric prefix with trailing garbage', '42 apples'],
    ['empty', 'empty string', ''],
  ])('refuses text -> number with 422 and keeps data intact for %s', async (key, _label, value) => {
    const slug = `retype_num_${key}`
    const branchId = await createSeedWithNotes(slug, ['7', value])

    const response = await admin.patch(`/api/seeds/${slug}/branches/${branchId}/retype`, {
      newType: 'number',
      confirm: `${slug}.note`,
    })

    expect(response.status).toBe(422)
    const body = await response.json<{ type: string; detail: string }>()
    expect(body.type).toContain('retype-data-incompatible')
    expect(body.detail).toContain('1')
    expect(await readNotes(slug)).toEqual(['7', value])
    const record = await (await admin.get(`/api/seeds/${slug}`)).json<SeedRecordBody>()
    expect(record.definition.branches.find(b => b.alias === 'note')?.type).toBe('text')
  })

  it('allows text -> number when every value is a clean number or NULL', async () => {
    const branchId = await createSeedWithNotes('retype_ok', ['7', '3.5', null])

    const response = await admin.patch(`/api/seeds/retype_ok/branches/${branchId}/retype`, {
      newType: 'number',
      confirm: 'retype_ok.note',
    })

    expect(response.status).toBe(200)
    expect(await readNotes('retype_ok')).toEqual([7, 3.5, null])
  })

  it('allows text -> richtext regardless of content (lossless)', async () => {
    const branchId = await createSeedWithNotes('retype_text', ['N/A', '42 apples'])

    const response = await admin.patch(`/api/seeds/retype_text/branches/${branchId}/retype`, {
      newType: 'richtext',
      confirm: 'retype_text.note',
    })

    expect(response.status).toBe(200)
    expect(await readNotes('retype_text')).toEqual(['N/A', '42 apples'])
  })
})
