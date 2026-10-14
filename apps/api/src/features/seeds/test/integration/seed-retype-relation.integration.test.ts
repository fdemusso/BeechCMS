// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — retype of relation branches, integration tier. A retype body carries no `targetSeed`,
 * so a retype to `relation` can never produce a valid relation, and a multi-relation has no column to cast.
 * Both must be refused with 422 and leave the stored definition untouched.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import type { Seed } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('seeds slice — retype of relation branches (real D1)', () => {
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

  // Canonical seeds are manifest-owned and refuse REST edits, so the retype target is a runtime seed.
  beforeEach(async () => {
    await admin.post('/api/seeds', {
      slug: 'books',
      label: 'Books',
      branches: [
        { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
        { alias: 'note', label: 'Note', type: 'text' },
        { alias: 'contributors', label: 'Contributors', type: 'relation', targetSeed: 'authors', multiple: true, onDelete: 'CASCADE' },
      ],
    })
  })

  async function storedBooks(): Promise<Seed> {
    const row = await harness.db.prepare('SELECT definition FROM seeds WHERE slug = ?').bind('books').first<{ definition: string }>()
    if (!row) throw new Error('books seed missing')
    return JSON.parse(row.definition) as Seed
  }

  async function branchId(alias: string): Promise<string> {
    const branch = (await storedBooks()).branches.find(b => b.alias === alias)
    if (!branch) throw new Error(`${alias} branch missing`)
    return branch.id
  }

  it('retyping a text branch to relation is refused with 422 and stores no target-less relation', async () => {
    const before = await storedBooks()
    const id = await branchId('note')

    const response = await admin.patch(`/api/seeds/books/branches/${id}/retype`, {
      newType: 'relation',
      confirm: 'books.note',
    })

    expect(response.status).toBe(422)
    expect((await response.json<{ type: string }>()).type).toContain('validation-failed')
    expect(await storedBooks()).toEqual(before)
  })

  it.each(['text', 'relation'])('retyping the multi-relation contributors to %s is refused with 422, not a 500', async (newType) => {
    const before = await storedBooks()
    const id = await branchId('contributors')

    const response = await admin.patch(`/api/seeds/books/branches/${id}/retype`, {
      newType,
      confirm: 'books.contributors',
    })

    expect(response.status).toBe(422)
    expect((await response.json<{ type: string }>()).type).toContain('retype-not-supported')
    expect(await storedBooks()).toEqual(before)
  })
})
