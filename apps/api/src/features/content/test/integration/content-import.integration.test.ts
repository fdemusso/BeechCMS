// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — import integration tier.
 * Covers the full HTTP contract through the middleware chain against real D1 and real R2:
 * job creation, refusal ordering, multi-chunk continuation, insert-only semantics, and the
 * job-status authorization matrix. The chunk worker's own cursor/error-classification logic
 * is unit tested in `../../jobs/import-chunk.worker.test.ts` against a stubbed repository.
 * The presign leg needs S3 credentials the workers tier does not have; it is covered in the
 * forks tier by `apps/api/test/flow/flow-media-assets.test.ts`. Here the fixture is uploaded
 * directly to R2, mirroring the confirmed-skip documented for the import flow.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { contentImportJobs } from '../../jobs/import-chunk.worker'

const MEDIA_BUCKET = (env as unknown as Record<string, R2Bucket>).MEDIA_BUCKET

describe('content slice — import integration (real D1, real R2)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      env: { MEDIA_BUCKET, IMPORT_CHUNK_ROWS: '2' },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders, jobs: contentImportJobs }),
    })
    // `import_jobs` comes from the migration, not from CANONICAL_SEEDS, so `resetContentTables`
    // never clears it — rows would otherwise leak between tests in this file (the pool isolates
    // D1 per FILE, not per test).
    await env.DB.prepare('DELETE FROM content_import_jobs').run()
    admin = await harness.asUser('admin')
  })

  async function jobRowCount(): Promise<number> {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_import_jobs').first<{ n: number }>()
    return row?.n ?? 0
  }

  describe('POST /api/content/:slug/import', () => {
    it('a 5-row NDJSON import spanning three chunks completes with every row inserted', async () => {
      const key = 'fixtures/categories-5.ndjson'
      const body = ['A', 'B', 'C', 'D', 'E'].map((name) => JSON.stringify({ name })).join('\n') + '\n'
      await MEDIA_BUCKET.put(key, body)

      const response = await admin.post('/api/content/categories/import', { objectKey: key, format: 'ndjson' })

      expect(response.status).toBe(202)
      expect(response.headers.get('Location')).toMatch(/^\/api\/content\/import-jobs\/[^/]+$/)
      const { jobId } = await response.json<{ jobId: string }>()

      const status = await admin.get(`/api/content/import-jobs/${jobId}`)
      const statusBody = await status.json<{ state: string; rowsRead: number; insertedRows: number; failedRows: number }>()
      expect(statusBody).toMatchObject({ state: 'completed', rowsRead: 5, insertedRows: 5, failedRows: 0 })

      const list = await admin.get('/api/content/categories')
      const items = await list.json<Array<{ name: string }>>()
      expect(items.map((item) => item.name).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])

      const head = await MEDIA_BUCKET.head(key)
      expect(head).toBeNull()
    })

    it('a CSV import against the flat canonical seed inserts its rows', async () => {
      const key = 'fixtures/categories.csv'
      await MEDIA_BUCKET.put(key, 'name\r\nAlpha\r\nBeta\r\n')

      const response = await admin.post('/api/content/categories/import', { objectKey: key, format: 'csv' })

      expect(response.status).toBe(202)
      const { jobId } = await response.json<{ jobId: string }>()
      const status = await admin.get(`/api/content/import-jobs/${jobId}`)
      expect((await status.json<{ insertedRows: number }>()).insertedRows).toBe(2)
    })

    it('a CSV import against a seed with a relation branch is refused before any job row is created', async () => {
      const key = 'fixtures/posts.csv'
      await MEDIA_BUCKET.put(key, 'title\r\nOne\r\n')
      const before = await jobRowCount()

      const response = await admin.post('/api/content/posts/import', { objectKey: key, format: 'csv' })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-csv-requires-flat-seed')
      expect(await jobRowCount()).toBe(before)
    })

    it('an unsupported format value is refused with content-invalid-import-format', async () => {
      const response = await admin.post('/api/content/categories/import', { objectKey: 'whatever', format: 'xml' })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-invalid-import-format')
    })

    it('an unknown objectKey is refused with 404 and no job row is created', async () => {
      const before = await jobRowCount()

      const response = await admin.post('/api/content/categories/import', { objectKey: 'no-such-key', format: 'ndjson' })

      expect(response.status).toBe(404)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-import-object-not-found')
      expect(await jobRowCount()).toBe(before)
    })

    it('an object over IMPORT_MAX_BYTES is refused with 413 and no job row is created', async () => {
      const capHarness = await createTestHarness({
        db: env.DB,
        env: { MEDIA_BUCKET, IMPORT_MAX_BYTES: '10' },
        createApp: (authProviders) => createBeechApp({ seeds: [], authProviders, jobs: contentImportJobs }),
      })
      const capAdmin = await capHarness.asUser('admin')
      const key = 'fixtures/too-large.ndjson'
      await MEDIA_BUCKET.put(key, JSON.stringify({ name: 'This line is longer than ten bytes' }) + '\n')
      const before = await jobRowCount()

      const response = await capAdmin.post('/api/content/categories/import', { objectKey: key, format: 'ndjson' })

      expect(response.status).toBe(413)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-import-file-too-large')
      expect(await jobRowCount()).toBe(before)
    })

    it('a row missing a required branch is counted failed while sibling rows still insert', async () => {
      const key = 'fixtures/categories-mixed.ndjson'
      const body = [JSON.stringify({}), JSON.stringify({ name: 'Valid' })].join('\n') + '\n'
      await MEDIA_BUCKET.put(key, body)

      const response = await admin.post('/api/content/categories/import', { objectKey: key, format: 'ndjson' })
      const { jobId } = await response.json<{ jobId: string }>()

      const status = await admin.get(`/api/content/import-jobs/${jobId}`)
      const statusBody = await status.json<{ insertedRows: number; failedRows: number }>()
      expect(statusBody).toMatchObject({ insertedRows: 1, failedRows: 1 })
    })

    it('a row carrying an id does not overwrite an existing entry — it is inserted as a new entry with a fresh id', async () => {
      const existing = await admin.post('/api/content/categories', { name: 'Existing' })
      const { id: existingId } = await existing.json<{ id: string }>()
      const key = 'fixtures/categories-with-id.ndjson'
      await MEDIA_BUCKET.put(key, JSON.stringify({ id: existingId, name: 'Imported' }) + '\n')

      const response = await admin.post('/api/content/categories/import', { objectKey: key, format: 'ndjson' })
      const { jobId } = await response.json<{ jobId: string }>()
      await admin.get(`/api/content/import-jobs/${jobId}`)

      // Regression guard for insert-only: toImportPayload drops `id`, so a client-supplied id
      // in the file can never overwrite an existing entry.
      const untouched = await admin.get(`/api/content/categories/${existingId}`)
      expect((await untouched.json<{ name: string }>()).name).toBe('Existing')

      const list = await admin.get('/api/content/categories')
      const items = await list.json<Array<{ id: string; name: string }>>()
      const imported = items.find((item) => item.name === 'Imported')
      expect(imported?.id).toMatch(UUID_V4_PATTERN)
      expect(imported?.id).not.toBe(existingId)
    })
  })

  describe('GET /api/content/import-jobs/:id', () => {
    async function createJob(): Promise<string> {
      const key = `fixtures/status-${crypto.randomUUID()}.ndjson`
      await MEDIA_BUCKET.put(key, JSON.stringify({ name: 'Status Fixture' }) + '\n')
      const response = await admin.post('/api/content/categories/import', { objectKey: key, format: 'ndjson' })
      return (await response.json<{ jobId: string }>()).jobId
    }

    it('the job-status authorization matrix: creator, scoped grantee and unrelated caller resolve as expected; an unknown id is 404', async () => {
      const jobId = await createJob()

      // Scoped to 'categories' — the job's own target seed — never globally, so a 200 for
      // this caller proves the handler's scope check rather than a coarse
      // "holds content:create somewhere" gate.
      const rolesResponse = await admin.get('/api/rbac/roles')
      const { roles } = await rolesResponse.json<{ roles: Array<{ id: string; name: string }> }>()
      const superAdminRole = roles.find((role) => role.name === 'SuperAdmin')
      if (!superAdminRole) throw new Error('expected the seeded SuperAdmin role to exist')
      await admin.post('/api/rbac/assignments', {
        userId: CANONICAL_USERS.editor.id,
        roleId: superAdminRole.id,
        scope: 'categories',
      })

      const cases: Array<{ client: () => Promise<TestClient>; path: string; expectedStatus: number }> = [
        { client: async () => admin, path: `/api/content/import-jobs/${jobId}`, expectedStatus: 200 },
        { client: () => harness.asUser('editor'), path: `/api/content/import-jobs/${jobId}`, expectedStatus: 200 },
        { client: () => harness.asUser('viewer'), path: `/api/content/import-jobs/${jobId}`, expectedStatus: 403 },
        { client: async () => admin, path: '/api/content/import-jobs/00000000-0000-4000-8000-000000000000', expectedStatus: 404 },
      ]

      for (const testCase of cases) {
        const client = await testCase.client()
        const response = await client.get(testCase.path)
        expect(response.status).toBe(testCase.expectedStatus)
      }
    })
  })
})
