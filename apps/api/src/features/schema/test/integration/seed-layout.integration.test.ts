// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Schema slice — seed form layout, integration tier.
 * Covers `PUT /api/schema/:slug/layout` against real D1 through the full middleware chain.
 * Shape and semantic rules are unit-tested in `packages/core/src/dashboard-layout/seed-layout.test.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

/** Documented cap on a serialized form layout (256 KB). */
const MAX_LAYOUT_BYTES = 256 * 1024

interface LayoutShape {
  version: 1
  tabs: Array<{
    id: string
    label: string
    sections: Array<{ id: string; columns: Array<{ id: string; fields: Array<{ branchId: string }> }> }>
  }>
}

/** Every count stays under its own cap, so only the aggregate size can reject the result. */
function buildBulkyLayout(): LayoutShape {
  const tabs = Array.from({ length: 8 }, (_, tabIndex) => ({
    id: `tab-${tabIndex}`,
    label: `Tab ${tabIndex}`,
    sections: Array.from({ length: 20 }, (_, sectionIndex) => ({
      id: `tab-${tabIndex}-section-${sectionIndex}`,
      columns: Array.from({ length: 4 }, (_, columnIndex) => ({
        id: `tab-${tabIndex}-section-${sectionIndex}-column-${columnIndex}`,
        // Unknown branch ids are stripped by the semantic pass, so nothing else rejects this body.
        fields: Array.from({ length: 30 }, (_, fieldIndex) => ({ branchId: `br_unknown${fieldIndex}` })),
      })),
    })),
  }))
  return { version: 1, tabs }
}

describe('schema slice — seed form layout (real D1)', () => {
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

  describe('PUT /api/schema/:slug/layout', () => {
    it('rejects a layout whose serialized size exceeds the cap and stores nothing', async () => {
      const layout = buildBulkyLayout()
      expect(JSON.stringify(layout).length).toBeGreaterThan(MAX_LAYOUT_BYTES)

      const response = await admin.put('/api/schema/posts/layout', layout)

      expect(response.status).toBe(422)
      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seed_layouts WHERE slug = ?').bind('posts').first<{ n: number }>()
      expect(row?.n).toBe(0)
    })

    it('stores a small layout', async () => {
      const layout: LayoutShape = {
        version: 1,
        tabs: [{ id: 'data', label: 'Data', sections: [{ id: 's1', columns: [{ id: 'c1', fields: [] }] }] }],
      }

      const response = await admin.put('/api/schema/posts/layout', layout)

      expect(response.status).toBe(200)
      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seed_layouts WHERE slug = ?').bind('posts').first<{ n: number }>()
      expect(row?.n).toBe(1)
    })
  })
})
