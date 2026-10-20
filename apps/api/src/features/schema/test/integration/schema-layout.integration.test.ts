// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Schema slice — stored layout reconciliation, integration tier.
 * `GET /api/schema` must never serve a layout that hides a layoutable branch or breaks the
 * full-width rules, even when the seed changed after the layout was stored.
 * Reconciliation rules are unit-tested in `packages/core/src/dashboard-layout/seed-layout.test.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, CANONICAL_SEEDS, type TestClient, type TestHarness } from '@beechcms/testing'
import { isLayoutableBranch, validateLayoutAgainstSeed, type FormLayout, type Seed } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

type SchemaSeed = Seed & { layout?: FormLayout }

const postsSeed = CANONICAL_SEEDS.find((seed) => seed.slug === 'posts') as Seed

/** Layout stored when `posts` only had title + body, with the richtext body sharing a section. */
const STALE_LAYOUT: FormLayout = {
  version: 1,
  tabs: [
    {
      id: 'tab-data',
      label: 'Data',
      sections: [
        {
          id: 'sec-1',
          columns: [
            { id: 'col-1', fields: [{ branchId: 'br_01' }] },
            { id: 'col-2', fields: [{ branchId: 'br_02' }] },
          ],
        },
      ],
    },
  ],
}

function placedBranchIds(layout: FormLayout): string[] {
  return layout.tabs.flatMap((tab) =>
    tab.sections.flatMap((section) => section.columns.flatMap((column) => column.fields.map((field) => field.branchId))),
  )
}

describe('schema slice — stored layout reconciliation (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await harness.db.prepare('DELETE FROM seed_layouts').run()
  })

  async function storeLayout(layout: FormLayout): Promise<void> {
    await harness.db
      .prepare(`INSERT OR REPLACE INTO seed_layouts (slug, layout, updated_at, updated_by) VALUES ('posts', ?, 0, 'admin')`)
      .bind(JSON.stringify(layout))
      .run()
  }

  async function servedPostsSeed(): Promise<SchemaSeed> {
    const response = await admin.get('/api/schema')
    expect(response.status).toBe(200)
    const seeds = await response.json<SchemaSeed[]>()
    const posts = seeds.find((seed) => seed.slug === 'posts')
    expect(posts).toBeDefined()
    return posts as SchemaSeed
  }

  describe('GET /api/schema', () => {
    it('places every layoutable branch exactly once when the stored layout predates them', async () => {
      await storeLayout(STALE_LAYOUT)

      const served = await servedPostsSeed()

      const expected = postsSeed.branches.filter(isLayoutableBranch).map((branch) => branch.id).sort()
      expect(placedBranchIds(served.layout as FormLayout).sort()).toEqual(expected)
    })

    it('serves a layout that satisfies the full-width section rules', async () => {
      await storeLayout(STALE_LAYOUT)

      const served = await servedPostsSeed()

      const result = validateLayoutAgainstSeed(served.layout as FormLayout, postsSeed)
      expect(result).toMatchObject({ ok: true })
    })

    it('leaves the stored row untouched', async () => {
      await storeLayout(STALE_LAYOUT)

      await servedPostsSeed()

      const row = await harness.db.prepare(`SELECT layout FROM seed_layouts WHERE slug = 'posts'`).first<{ layout: string }>()
      expect(JSON.parse(row?.layout ?? 'null')).toEqual(STALE_LAYOUT)
    })
  })
})
