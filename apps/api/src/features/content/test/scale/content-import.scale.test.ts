// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — import scale tier.
 * Drives a single import job across the real default chunk size (no IMPORT_CHUNK_ROWS
 * override) so the self-continuation loop in the chunk worker runs its production
 * boundary condition — many re-enqueues, not the two- or three-chunk shape the
 * integration tier exercises. Contract assertions (refusals, auth matrix, insert-only
 * semantics) stay in `../integration/content-import.integration.test.ts`; this file only
 * proves the loop still terminates correctly and within bounds at volume.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { DEFAULT_IMPORT_CHUNK_ROWS } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { contentImportJobs } from '../../jobs/import-chunk.worker'

const MEDIA_BUCKET = (env as unknown as Record<string, R2Bucket>).MEDIA_BUCKET
const ROW_COUNT = 5_000

describe('content slice — import scale tier', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      env: { MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders, jobs: contentImportJobs }),
    })
    // `import_jobs` comes from the migration, not from CANONICAL_SEEDS, so the harness's
    // content-table reset never clears it between tests in this file (the pool isolates
    // D1 per FILE, not per test).
    await env.DB.prepare('DELETE FROM content_import_jobs').run()
    admin = await harness.asUser('admin')
  })

  async function categoryRowCount(): Promise<number> {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_categories').first<{ n: number }>()
    return row?.n ?? 0
  }

  describe('POST /api/content/:slug/import', () => {
    it(`a ${ROW_COUNT}-row NDJSON import completes after ${ROW_COUNT / DEFAULT_IMPORT_CHUNK_ROWS} real chunk continuations, with every row inserted`, async () => {
      const key = 'fixtures/categories-scale.ndjson'
      const body = Array.from({ length: ROW_COUNT }, (_, i) => JSON.stringify({ name: `Category ${i}` })).join('\n') + '\n'
      await MEDIA_BUCKET.put(key, body)

      const start = performance.now()
      const response = await admin.post('/api/content/categories/import', { objectKey: key, format: 'ndjson' })
      const elapsed = performance.now() - start

      expect(response.status).toBe(202)
      const { jobId } = await response.json<{ jobId: string }>()

      const status = await admin.get(`/api/content/import-jobs/${jobId}`)
      const statusBody = await status.json<{ state: string; rowsRead: number; insertedRows: number; failedRows: number }>()
      expect(statusBody).toMatchObject({ state: 'completed', rowsRead: ROW_COUNT, insertedRows: ROW_COUNT, failedRows: 0 })

      expect(await categoryRowCount()).toBe(ROW_COUNT)

      const head = await MEDIA_BUCKET.head(key)
      expect(head).toBeNull()

      // Generous bound for 10 real chunk continuations inserting 5,000 rows against
      // Miniflare D1 — this guards against a broken continuation loop (a stalled or
      // infinitely re-enqueued chunk) rather than chasing steady-state CI latency.
      expect(elapsed).toBeLessThan(20_000)
    })
  })
})
