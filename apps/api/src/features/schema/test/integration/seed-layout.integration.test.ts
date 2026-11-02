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
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { GLOBAL_SCOPE } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SEEDS_ROLE_ID = 'b15c6d7e-8f90-4a12-83b4-c5de6f708192'

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

const SMALL_LAYOUT: LayoutShape = {
  version: 1,
  tabs: [{ id: 'data', label: 'Data', sections: [{ id: 's1', columns: [{ id: 'c1', fields: [] }] }] }],
}

describe('schema slice — seed form layout (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    // Custom roles (and their assignments, via FK cascade) outlive each test in the file's D1 storage frame.
    await env.DB.prepare('DELETE FROM roles WHERE is_system = 0').run()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await harness.db.prepare('DELETE FROM seed_layouts').run()
  })

  const grantEditor = async (scope: string): Promise<void> => {
    await harness.db.batch([
      harness.db.prepare('INSERT INTO roles (id, name) VALUES (?, ?)').bind(SEEDS_ROLE_ID, 'Seeds manager'),
      harness.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(SEEDS_ROLE_ID, 'manage_seeds'),
      harness.db
        .prepare('INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)')
        .bind('seeds-assignment', CANONICAL_USERS.editor.id, SEEDS_ROLE_ID, scope),
    ])
  }

  async function storedLayoutCount(slug: string): Promise<number> {
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seed_layouts WHERE slug = ?').bind(slug).first<{ n: number }>()
    return row?.n ?? 0
  }

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

    it('refuses a tab label over 15 characters and stores nothing', async () => {
      const layout: LayoutShape = { ...SMALL_LAYOUT, tabs: [{ ...SMALL_LAYOUT.tabs[0], label: 'x'.repeat(16) }] }

      const response = await admin.put('/api/schema/posts/layout', layout)

      expect(response.status).toBe(422)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('refuses a section label over 50 characters and stores nothing', async () => {
      const section = { ...SMALL_LAYOUT.tabs[0].sections[0], label: 'x'.repeat(51) }
      const layout: LayoutShape = { ...SMALL_LAYOUT, tabs: [{ ...SMALL_LAYOUT.tabs[0], sections: [section] }] }

      const response = await admin.put('/api/schema/posts/layout', layout)

      expect(response.status).toBe(422)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('stores labels trimmed', async () => {
      const section = { ...SMALL_LAYOUT.tabs[0].sections[0], label: '  Intro  ' }
      const layout: LayoutShape = { ...SMALL_LAYOUT, tabs: [{ ...SMALL_LAYOUT.tabs[0], label: ' Main ', sections: [section] }] }

      const response = await admin.put('/api/schema/posts/layout', layout)

      expect(response.status).toBe(200)
      const body = await response.json<{ layout: { tabs: Array<{ label: string; sections: Array<{ label?: string }> }> } }>()
      expect([body.layout.tabs[0].label, body.layout.tabs[0].sections[0].label]).toEqual(['Main', 'Intro'])
    })

    it('forbids a caller without manage_seeds and stores nothing', async () => {
      const editor = await harness.asUser('editor')

      const response = await editor.put('/api/schema/posts/layout', SMALL_LAYOUT)

      expect(response.status).toBe(403)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('the canonical editor holding manage_seeds at * stores a layout with 200 and the row exists', async () => {
      await grantEditor(GLOBAL_SCOPE)
      const editor = await harness.asUser('editor')

      const response = await editor.put('/api/schema/posts/layout', SMALL_LAYOUT)

      expect(response.status).toBe(200)
      expect(await storedLayoutCount('posts')).toBe(1)
    })

    it("manage_seeds held only on seed 'posts' is refused 403 on PUT and nothing is stored", async () => {
      await grantEditor('posts')
      const editor = await harness.asUser('editor')

      const response = await editor.put('/api/schema/posts/layout', SMALL_LAYOUT)

      expect(response.status).toBe(403)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('returns 404 for an unknown seed and stores nothing', async () => {
      const response = await admin.put('/api/schema/no_such_seed/layout', SMALL_LAYOUT)

      expect(response.status).toBe(404)
      expect(await storedLayoutCount('no_such_seed')).toBe(0)
    })

    // The permission and the seed are checked before the body is read: a caller who may not edit, or who
    // names no seed, must not learn what the layout contract looks like from a 400/422.
    it('forbids a caller without manage_seeds before looking at the body, even when it is not JSON', async () => {
      const editor = await harness.asUser('editor')

      const response = await editor.put('/api/schema/posts/layout', undefined, {
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      })

      expect(response.status).toBe(403)
    })

    it('returns 404 for an unknown seed before looking at the body, even when it is not JSON', async () => {
      const response = await admin.put('/api/schema/no_such_seed/layout', undefined, {
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      })

      expect(response.status).toBe(404)
    })

    it('returns 400 for a body that is not JSON', async () => {
      const response = await admin.put('/api/schema/posts/layout', undefined, {
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      })

      expect(response.status).toBe(400)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('returns 422 with a readable detail for a body that fails the shape check', async () => {
      const response = await admin.put('/api/schema/posts/layout', { version: 2, tabs: [] })

      expect(response.status).toBe(422)
      const problem = await response.json<{ detail: string }>()
      expect(problem.detail).toContain('tabs')
      // A raw Zod dump is a pretty-printed JSON array of issue objects.
      expect(problem.detail).not.toContain('"code"')
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('returns 422 when a branch is placed twice and stores nothing', async () => {
      const layout: LayoutShape = {
        version: 1,
        tabs: [{
          id: 'data',
          label: 'Data',
          sections: [{ id: 's1', columns: [{ id: 'c1', fields: [{ branchId: 'br_01' }, { branchId: 'br_01' }] }] }],
        }],
      }

      const response = await admin.put('/api/schema/posts/layout', layout)

      expect(response.status).toBe(422)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('returns 422 when two sections share an id and stores nothing', async () => {
      const layout: LayoutShape = {
        version: 1,
        tabs: [{
          id: 'data',
          label: 'Data',
          sections: [
            { id: 's', columns: [{ id: 'c1', fields: [] }] },
            { id: 's', columns: [{ id: 'c2', fields: [] }] },
          ],
        }],
      }

      const response = await admin.put('/api/schema/posts/layout', layout)

      expect(response.status).toBe(422)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('replaces the stored layout on a second save and stamps the injected clock', async () => {
      await admin.put('/api/schema/posts/layout', SMALL_LAYOUT)
      harness.clock.advance(60_000)
      const second: LayoutShape = { version: 1, tabs: [{ ...SMALL_LAYOUT.tabs[0], label: 'Renamed' }] }

      const response = await admin.put('/api/schema/posts/layout', second)

      expect(response.status).toBe(200)
      const row = await harness.db
        .prepare('SELECT layout, updated_at FROM seed_layouts WHERE slug = ?')
        .bind('posts')
        .first<{ layout: string; updated_at: number }>()
      expect(JSON.parse(row?.layout ?? 'null').tabs[0].label).toBe('Renamed')
      expect(row?.updated_at).toBe(harness.clock.nowSeconds())
    })
  })

  describe('DELETE /api/schema/:slug/layout', () => {
    it('removes the stored layout', async () => {
      await admin.put('/api/schema/posts/layout', SMALL_LAYOUT)

      const response = await admin.delete('/api/schema/posts/layout')

      expect(response.status).toBe(200)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('the canonical editor holding manage_seeds at * resets a stored layout with 200 and the row is gone', async () => {
      await admin.put('/api/schema/posts/layout', SMALL_LAYOUT)
      await grantEditor(GLOBAL_SCOPE)
      const editor = await harness.asUser('editor')

      const response = await editor.delete('/api/schema/posts/layout')

      expect(response.status).toBe(200)
      expect(await storedLayoutCount('posts')).toBe(0)
    })

    it('forbids a caller without manage_seeds and keeps the stored layout', async () => {
      await admin.put('/api/schema/posts/layout', SMALL_LAYOUT)
      const editor = await harness.asUser('editor')

      const response = await editor.delete('/api/schema/posts/layout')

      expect(response.status).toBe(403)
      expect(await storedLayoutCount('posts')).toBe(1)
    })

    it('returns 404 for an unknown seed', async () => {
      const response = await admin.delete('/api/schema/no_such_seed/layout')

      expect(response.status).toBe(404)
    })
  })
})
