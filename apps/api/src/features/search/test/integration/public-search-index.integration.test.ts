// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Search slice — public index endpoint, integration tier. Covers
 * `GET /api/v1/public/search/index/:seedSlug/:file`: the compiled R2 index is served only for seeds
 * with `allowPublicRead`, and manifest titles never expose a non-public display-name branch.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, generateVectorTable, vectorTableName } from '@beechcms/core'
import { createTestHarness, TEST_PUBLIC_READ_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { D1VectorRepository } from '../../../../shared/db/repositories/d1-vector.repository'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { compileR2Manifest, manifestKey, vectorsKey } from '../../jobs/semantic-search.worker'

const privateSeed = defineSeed({
  slug: 'idx_clients', label: 'Clients', displayNameAlias: 'full_name', allowPublicRead: false,
  branches: [
    { id: 'br_01', alias: 'full_name', label: 'Full name', type: 'text', requiredOnCreate: true, policies: { classification: 'internal' } },
    { id: 'br_02', alias: 'notes', label: 'Notes', type: 'text', policies: { search: true, public: true } },
  ],
})
const publicSeed = defineSeed({
  slug: 'idx_articles', label: 'Articles', displayNameAlias: 'title', allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { search: true, public: true } },
  ],
})
const hiddenTitleSeed = defineSeed({
  slug: 'idx_staff', label: 'Staff', displayNameAlias: 'full_name', allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'full_name', label: 'Full name', type: 'text', requiredOnCreate: true, policies: { classification: 'internal' } },
    { id: 'br_02', alias: 'bio', label: 'Bio', type: 'text', policies: { search: true, public: true } },
  ],
})

describe('public search index — integration (real D1 + R2)', () => {
  let harness: TestHarness
  let admin: TestClient
  let publicClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [privateSeed, publicSeed, hiddenTitleSeed],
      env: { SEARCH_R2: env.SEARCH_R2 },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    publicClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLIC_READ_KEY })
    // The harness provisions content tables only; vector tables are created by the seed-apply flow.
    for (const seed of [privateSeed, publicSeed, hiddenTitleSeed]) {
      await env.DB.exec(generateVectorTable(seed)!.replace(/\s*\n\s*/g, ' '))
      await env.DB.prepare(`DELETE FROM ${vectorTableName(seed)}`).run()
    }
    for (const slug of ['idx_clients', 'idx_articles', 'idx_staff', 'idx_ghost']) {
      await env.SEARCH_R2.delete([manifestKey(slug), vectorsKey(slug)])
    }
  })

  /** Persists a vector for a freshly published entry, then compiles the seed's R2 index. */
  async function indexEntry(seed: typeof privateSeed, data: Record<string, unknown>): Promise<string> {
    const created = await admin.post(`/api/content/${seed.slug}`, { ...data, status: 'published' })
    expect(created.status).toBe(201) // precondition
    const { id } = await created.json<{ id: string }>()
    await new D1VectorRepository(env.DB).saveVector(seed, id, new Float32Array([0.1, 0.2, 0.3]))
    await compileR2Manifest(seed, env.DB, env.SEARCH_R2)
    return id
  }

  describe('GET /api/v1/public/search/index/:seedSlug/:file', () => {
    it('404s manifest.json and vectors.bin of a seed without allowPublicRead', async () => {
      await indexEntry(privateSeed, { full_name: 'Alice Secret', notes: 'vip customer' })
      expect(await env.SEARCH_R2.head(manifestKey(privateSeed.slug))).not.toBeNull() // precondition

      const manifest = await publicClient.get(`/api/v1/public/search/index/${privateSeed.slug}/manifest.json`)
      const vectors = await publicClient.get(`/api/v1/public/search/index/${privateSeed.slug}/vectors.bin`)

      expect(manifest.status).toBe(404)
      expect(vectors.status).toBe(404)
    })

    it('404s when the seed does not exist, even if an orphan object sits in R2', async () => {
      await env.SEARCH_R2.put(manifestKey('idx_ghost'), '{"records":[]}')
      await env.SEARCH_R2.put(vectorsKey('idx_ghost'), new Uint8Array(4))

      const response = await publicClient.get('/api/v1/public/search/index/idx_ghost/manifest.json')

      expect(response.status).toBe(404)
    })

    it('serves the compiled manifest and vectors of a publicly readable seed', async () => {
      const id = await indexEntry(publicSeed, { title: 'Hello world' })

      const manifest = await publicClient.get(`/api/v1/public/search/index/${publicSeed.slug}/manifest.json`)
      const vectors = await publicClient.get(`/api/v1/public/search/index/${publicSeed.slug}/vectors.bin`)

      expect(manifest.status).toBe(200)
      const body = await manifest.json<{ records: { id: string; title: string }[] }>()
      expect(body.records).toEqual([{ id, title: 'Hello world' }])
      expect(vectors.status).toBe(200)
      expect((await vectors.arrayBuffer()).byteLength).toBe(3 * Float32Array.BYTES_PER_ELEMENT)
    })

    it('leaves the manifest title empty when the display-name branch is not public', async () => {
      const id = await indexEntry(hiddenTitleSeed, { full_name: 'Bob Internal', bio: 'public bio' })

      const response = await publicClient.get(`/api/v1/public/search/index/${hiddenTitleSeed.slug}/manifest.json`)

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).not.toContain('Bob Internal')
      expect(JSON.parse(text).records).toEqual([{ id, title: '' }])
    })
  })
})
