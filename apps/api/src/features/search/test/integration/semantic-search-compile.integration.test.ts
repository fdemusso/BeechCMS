// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Search slice — R2 index compilation, integration tier (real D1 + R2).
 * Compile jobs run from the queue consumer, so they are driven directly as in
 * public-search-index.integration.test.ts. The R2 and D1 wrappers below only delegate
 * and observe/hold calls; they never replace storage behaviour.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, generateVectorTable, vectorTableName } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { D1VectorRepository } from '../../../../shared/db/repositories/d1-vector.repository'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { compileR2Manifest, manifestKey, vectorsKey } from '../../jobs/semantic-search.worker'

const articleSeed = defineSeed({
  slug: 'cmp_articles', label: 'Articles', displayNameAlias: 'title', allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { search: true, public: true } },
  ],
})

const VECTOR_DIMENSIONS = 3

/** Forwards every call to `target`, binding native methods so workerd accepts the proxy. */
function delegate<T extends object>(target: T, overrides: Partial<Record<keyof T, unknown>>): T {
  return new Proxy(target, {
    get(object, property) {
      if (Object.hasOwn(overrides, property)) return overrides[property as keyof T]
      const value = Reflect.get(object, property) as unknown
      return typeof value === 'function' ? value.bind(object) : value
    },
  })
}

/** Holds the first `vectors.bin` write until `release()`, so a test can interleave a second compile. */
function holdFirstVectorsPut(bucket: R2Bucket, key: string) {
  let release!: () => void
  let reached!: () => void
  const released = new Promise<void>((resolve) => { release = resolve })
  const firstPutReached = new Promise<void>((resolve) => { reached = resolve })
  let held = false
  const put: R2Bucket['put'] = async (objectKey, value, options) => {
    if (objectKey === key && !held) {
      held = true
      reached()
      await released
    }
    return bucket.put(objectKey, value, options)
  }
  return { bucket: delegate(bucket, { put }), firstPutReached, release }
}

/** Records how many rows each D1 `.all()` query returns. */
function recordRowsPerQuery(db: D1Database) {
  const rowsPerQuery: number[] = []
  const wrapStatement = (statement: D1PreparedStatement): D1PreparedStatement =>
    delegate(statement, {
      bind: (...values: unknown[]) => wrapStatement(statement.bind(...values)),
      all: async () => {
        const result = await statement.all()
        rowsPerQuery.push(result.results.length)
        return result
      },
    })
  return { db: delegate(db, { prepare: (sql: string) => wrapStatement(db.prepare(sql)) }), rowsPerQuery }
}

describe('R2 index compilation — integration (real D1 + R2)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [articleSeed],
      env: { SEARCH_R2: env.SEARCH_R2 },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await env.DB.exec(generateVectorTable(articleSeed)!.replace(/\s*\n\s*/g, ' '))
    await env.DB.prepare(`DELETE FROM ${vectorTableName(articleSeed)}`).run()
    await env.SEARCH_R2.delete([manifestKey(articleSeed.slug), vectorsKey(articleSeed.slug)])
  })

  /** Publishes an entry through the API and stores its vector, without compiling R2. */
  async function storeVector(title: string): Promise<string> {
    const created = await admin.post(`/api/content/${articleSeed.slug}`, { title, status: 'published' })
    expect(created.status).toBe(201) // precondition
    const { id } = await created.json<{ id: string }>()
    await new D1VectorRepository(env.DB).saveVector(articleSeed, id, new Float32Array([0.1, 0.2, 0.3]))
    return id
  }

  async function readCompiledIndex(): Promise<{ recordIds: string[]; vectorBytes: number }> {
    const manifestObject = await env.SEARCH_R2.get(manifestKey(articleSeed.slug))
    const vectorsObject = await env.SEARCH_R2.get(vectorsKey(articleSeed.slug))
    const manifest = JSON.parse(await manifestObject!.text()) as { records: { id: string }[] }
    return { recordIds: manifest.records.map((record) => record.id), vectorBytes: (await vectorsObject!.arrayBuffer()).byteLength }
  }

  describe('compileR2Manifest', () => {
    it('a compile that read an older snapshot cannot overwrite a newer compiled index', async () => {
      const firstId = await storeVector('First')
      const slow = holdFirstVectorsPut(env.SEARCH_R2, vectorsKey(articleSeed.slug))
      const slowCompile = compileR2Manifest(articleSeed, env.DB, slow.bucket)
      // The slow compile has now read the one-vector snapshot and is about to write it.
      await slow.firstPutReached
      const secondId = await storeVector('Second')
      await compileR2Manifest(articleSeed, env.DB, env.SEARCH_R2)

      slow.release()
      await slowCompile

      const index = await readCompiledIndex()
      expect([...index.recordIds].sort()).toEqual([firstId, secondId].sort())
      // Manifest and vectors.bin must come from the same snapshot, or SearchClient mis-slices the buffer.
      expect(index.vectorBytes).toBe(2 * VECTOR_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT)
    })

    it('reads vectors from D1 in pages no larger than the requested page size', async () => {
      const ids = [await storeVector('One'), await storeVector('Two'), await storeVector('Three'), await storeVector('Four'), await storeVector('Five')]
      const observed = recordRowsPerQuery(env.DB)

      await compileR2Manifest(articleSeed, observed.db, env.SEARCH_R2, { pageSize: 2 })

      expect(Math.max(...observed.rowsPerQuery)).toBeLessThanOrEqual(2)
      const index = await readCompiledIndex()
      expect([...index.recordIds].sort()).toEqual([...ids].sort())
      expect(index.vectorBytes).toBe(5 * VECTOR_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT)
    })
  })
})
