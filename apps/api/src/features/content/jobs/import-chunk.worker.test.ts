// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Unit tier — `contentImportChunkJob` driven against a stubbed `ContentRepository`,
 * a stubbed `BeechBucket` backed by an in-memory fixture, and a recording `IQueueService`.
 * A local seam resolves the two `Seed` definitions the job needs from `D1SeedRepository`,
 * keeping the test off real D1 (Rule 0.2).
 */

import { describe, it, expect } from 'vitest'
import {
  EntryNotFoundError,
  SlugConflictError,
  MAX_JOB_ERROR_SAMPLES,
  SystemIdGenerator,
  type BeechBucket,
  type ContentRepository,
  type IQueueService,
  type JobContext,
  type Seed,
} from '@beechcms/core'
import { FixedClock, UUID_V4_PATTERN } from '@beechcms/testing'
import { contentImportChunkJob } from './import-chunk.worker'
import { CONTENT_IMPORT_CHUNK_JOB, IMPORT_JOBS_SLUG, IMPORT_JOB_FIELDS } from '../import-job'

const JOB_SEED: Seed = {
  slug: IMPORT_JOBS_SLUG,
  label: 'Import Job',
  displayNameAlias: 'target_seed',
  branches: [],
}

const TARGET_SEED: Seed = {
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
  ],
}

interface StoredRow {
  id: string
  slug: string
  status: string
  [key: string]: unknown
}

/** Generic in-memory `ContentRepository`, keyed per seed slug, shared by job rows and target entries. */
function createFakeRepository() {
  const tables = new Map<string, Map<string, StoredRow>>()
  const updates: Array<{ seedSlug: string; id: string; data: Record<string, unknown> }> = []

  function table(seed: Seed): Map<string, StoredRow> {
    let rows = tables.get(seed.slug)
    if (!rows) {
      rows = new Map()
      tables.set(seed.slug, rows)
    }
    return rows
  }

  const repository: ContentRepository = {
    async findMany() {
      throw new Error('not implemented in fake repository')
    },
    async findById(seed, id) {
      const row = table(seed).get(id)
      if (!row) throw new EntryNotFoundError(`${seed.slug}/${id} not found`)
      return row
    },
    async findBySlug(seed, slug) {
      for (const row of table(seed).values()) if (row.slug === slug) return row
      throw new EntryNotFoundError(`${seed.slug} slug "${slug}" not found`)
    },
    async findParentIdsByRelation() {
      throw new Error('not implemented in fake repository')
    },
    async create(seed, id, slug, status, data) {
      const rows = table(seed)
      for (const row of rows.values()) {
        if (row.slug === slug) throw new SlugConflictError(`slug "${slug}" already exists for "${seed.slug}"`)
      }
      rows.set(id, { id, slug, status, created_at: 0, updated_at: 0, ...data })
    },
    async update(seed, id, data, status) {
      const rows = table(seed)
      const existing = rows.get(id)
      if (!existing) throw new EntryNotFoundError(`${seed.slug}/${id} not found`)
      Object.assign(existing, data, status !== undefined ? { status } : {})
      updates.push({ seedSlug: seed.slug, id, data })
    },
    async delete() {
      throw new Error('not implemented in fake repository')
    },
  }

  return { repository, tables, updates }
}

function seedJobRow(
  repository: ContentRepository,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<void> {
  const f = IMPORT_JOB_FIELDS
  return repository.create(JOB_SEED, 'job-1', 'job-1', 'published', {
    [f.targetSeed]: 'posts',
    [f.format]: 'ndjson',
    [f.objectKey]: 'objects/fixture.ndjson',
    [f.state]: 'pending',
    [f.rowOffset]: 0,
    [f.insertedRows]: 0,
    [f.failedRows]: 0,
    [f.errorReport]: [],
    [f.createdBy]: 'admin-1',
    [f.finishedAt]: null,
    ...overrides,
  })
}

function getRow(tables: Map<string, Map<string, StoredRow>>, seedSlug: string, id: string): StoredRow {
  const row = tables.get(seedSlug)?.get(id)
  if (!row) throw new Error(`expected row "${seedSlug}/${id}" to exist in the fake repository`)
  return row
}

function getRows(tables: Map<string, Map<string, StoredRow>>, seedSlug: string): StoredRow[] {
  return [...(tables.get(seedSlug)?.values() ?? [])]
}

function createSeedDb(): D1Database {
  const bySlug: Record<string, Seed> = { [JOB_SEED.slug]: JOB_SEED, [TARGET_SEED.slug]: TARGET_SEED }
  return {
    prepare: () => ({
      bind: (slug: string) => ({
        first: async () => {
          const definition = bySlug[slug]
          if (!definition) return null
          return { slug, definition: JSON.stringify(definition), status: 'active', source: 'code', created_at: 0, updated_at: 0 }
        },
      }),
    }),
  } as unknown as D1Database
}

function createBucketStub(bodyText: string): BeechBucket & { deletes: string[]; gets: string[] } {
  const deletes: string[] = []
  const gets: string[] = []
  return {
    async put() {},
    async get(key) {
      gets.push(key)
      return { body: new Blob([bodyText]).stream(), size: bodyText.length }
    },
    async delete(key) {
      deletes.push(key)
    },
    async head() {
      return null
    },
    getUrl: () => '',
    async getTotalSize() {
      return 0
    },
    async list() {
      return { objects: [] }
    },
    async presignPut() {
      return ''
    },
    async presignGet() {
      return ''
    },
    deletes,
    gets,
  }
}

function createQueueStub(accepted: boolean): IQueueService & { messages: Array<{ name: string; payload: unknown }> } {
  const messages: Array<{ name: string; payload: unknown }> = []
  return {
    async enqueue(name, payload) {
      messages.push({ name, payload })
      return accepted
    },
    messages,
  }
}

function buildContext(options: { bodyText: string; env?: Record<string, string>; accepted?: boolean }): {
  context: JobContext
  repository: ContentRepository
  tables: Map<string, Map<string, StoredRow>>
  bucket: BeechBucket & { deletes: string[]; gets: string[] }
  queue: IQueueService & { messages: Array<{ name: string; payload: unknown }> }
} {
  const { repository, tables } = createFakeRepository()
  const bucket = createBucketStub(options.bodyText)
  const queue = createQueueStub(options.accepted ?? true)
  // `D1SeedRepository` is constructed inside the worker from `context.env['DB']` — this
  // stub answers its two lookups (import_jobs, posts) without touching real D1.
  const env = { DB: createSeedDb(), ...options.env } as unknown as JobContext['env']
  const context: JobContext = {
    repository,
    bucket,
    clock: new FixedClock(Date.UTC(2026, 0, 1)),
    idGenerator: SystemIdGenerator,
    queue,
    env,
  }
  return { context, repository, tables, bucket, queue }
}

describe('contentImportChunkJob', () => {
  it('a two-record NDJSON file with IMPORT_CHUNK_ROWS 1 leaves row_offset 1, job_state processing, and re-enqueues', async () => {
    const { context, repository, tables, queue } = buildContext({
      bodyText: '{"title":"A"}\n{"title":"B"}\n',
      env: { IMPORT_CHUNK_ROWS: '1' },
    })
    await seedJobRow(repository)

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    const job = getRow(tables, IMPORT_JOBS_SLUG, 'job-1')
    expect(job[IMPORT_JOB_FIELDS.rowOffset]).toBe(1)
    expect(job[IMPORT_JOB_FIELDS.state]).toBe('processing')
    expect(queue.messages).toEqual([{ name: CONTENT_IMPORT_CHUNK_JOB, payload: { jobId: 'job-1' } }])
    const inserted = getRows(tables, 'posts')
    expect(inserted.map((row) => row.title)).toEqual(['A'])
    expect(inserted[0].id).toMatch(UUID_V4_PATTERN)
  })

  it('resuming from row_offset 1 inserts only the second record, guarding against re-processing already-inserted rows as duplicates', async () => {
    const { context, repository, tables, bucket } = buildContext({
      bodyText: '{"title":"A"}\n{"title":"B"}\n',
    })
    await seedJobRow(repository, {
      [IMPORT_JOB_FIELDS.rowOffset]: 1,
      [IMPORT_JOB_FIELDS.insertedRows]: 1,
      [IMPORT_JOB_FIELDS.state]: 'processing',
    })

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    const job = getRow(tables, IMPORT_JOBS_SLUG, 'job-1')
    expect(job[IMPORT_JOB_FIELDS.rowOffset]).toBe(2)
    expect(job[IMPORT_JOB_FIELDS.insertedRows]).toBe(2)
    expect(job[IMPORT_JOB_FIELDS.state]).toBe('completed')
    const inserted = getRows(tables, 'posts')
    expect(inserted.map((row) => row.title)).toEqual(['B'])
    expect(bucket.deletes).toHaveLength(1)
  })

  it('a SlugConflictError from repository.create is counted as a failed row and does not abort the chunk', async () => {
    const { context, repository, tables } = buildContext({
      bodyText: '{"title":"Same Title"}\n{"title":"Same Title"}\n',
    })
    await seedJobRow(repository)

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    const job = getRow(tables, IMPORT_JOBS_SLUG, 'job-1')
    expect(job[IMPORT_JOB_FIELDS.insertedRows]).toBe(1)
    expect(job[IMPORT_JOB_FIELDS.failedRows]).toBe(1)
    expect(job[IMPORT_JOB_FIELDS.errorReport]).toMatchObject([{ code: 'duplicate_slug' }])
  })

  it('a malformed NDJSON line is counted failed and the following valid line still inserts', async () => {
    const { context, repository, tables } = buildContext({
      bodyText: 'not-json\n{"title":"C"}\n',
    })
    await seedJobRow(repository)

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    const job = getRow(tables, IMPORT_JOBS_SLUG, 'job-1')
    expect(job[IMPORT_JOB_FIELDS.insertedRows]).toBe(1)
    expect(job[IMPORT_JOB_FIELDS.failedRows]).toBe(1)
    expect(job[IMPORT_JOB_FIELDS.errorReport]).toMatchObject([{ code: 'invalid_json' }])
  })

  it('a CSV quoted field containing a newline yields one record, not two', async () => {
    const { context, repository, tables } = buildContext({
      bodyText: 'title\r\n"Multi\nLine"\r\n',
    })
    await seedJobRow(repository, { [IMPORT_JOB_FIELDS.format]: 'csv' })

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    const job = getRow(tables, IMPORT_JOBS_SLUG, 'job-1')
    expect(job[IMPORT_JOB_FIELDS.insertedRows]).toBe(1)
    const inserted = getRows(tables, 'posts')
    expect(inserted[0].title).toBe('Multi\nLine')
  })

  it('150 failing rows with MAX_JOB_ERROR_SAMPLES at 100 leave errors capped while failed_rows keeps counting', async () => {
    const lines = Array.from({ length: 150 }, () => 'not-json').join('\n') + '\n'
    const { context, repository, tables } = buildContext({ bodyText: lines })
    await seedJobRow(repository)

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    const job = getRow(tables, IMPORT_JOBS_SLUG, 'job-1')
    expect(job[IMPORT_JOB_FIELDS.failedRows]).toBe(150)
    expect((job[IMPORT_JOB_FIELDS.errorReport] as unknown[]).length).toBe(MAX_JOB_ERROR_SAMPLES)
  })

  it('reaching EOF sets job_state completed, a non-null finished_at, and deletes the R2 object exactly once', async () => {
    const { context, repository, tables, bucket } = buildContext({ bodyText: '{"title":"A"}\n' })
    await seedJobRow(repository)

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    const job = getRow(tables, IMPORT_JOBS_SLUG, 'job-1')
    expect(job[IMPORT_JOB_FIELDS.state]).toBe('completed')
    expect(job[IMPORT_JOB_FIELDS.finishedAt]).not.toBeNull()
    expect(bucket.deletes).toEqual(['objects/fixture.ndjson'])
  })

  it('a job already completed returns without writing to the repository or touching the bucket', async () => {
    const { context, repository, tables, bucket } = buildContext({ bodyText: '{"title":"A"}\n' })
    await seedJobRow(repository, {
      [IMPORT_JOB_FIELDS.state]: 'completed',
      [IMPORT_JOB_FIELDS.finishedAt]: 1_700_000_000,
    })
    const before = { ...getRow(tables, IMPORT_JOBS_SLUG, 'job-1') }

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    // Re-delivered queue messages are at-least-once (Cloudflare Queues contract); a duplicate
    // delivery for a finished job must be a no-op, never a second R2 delete.
    expect(getRow(tables, IMPORT_JOBS_SLUG, 'job-1')).toEqual(before)
    expect(bucket.gets).toHaveLength(0)
    expect(bucket.deletes).toHaveLength(0)
  })

  it('queue.enqueue resolving false finishes the job failed with a queue_unavailable sample', async () => {
    const { context, repository, tables, bucket } = buildContext({
      bodyText: '{"title":"A"}\n{"title":"B"}\n',
      env: { IMPORT_CHUNK_ROWS: '1' },
      accepted: false,
    })
    await seedJobRow(repository)

    await contentImportChunkJob({ jobId: 'job-1' }, context)

    const job = getRow(tables, IMPORT_JOBS_SLUG, 'job-1')
    expect(job[IMPORT_JOB_FIELDS.state]).toBe('failed')
    expect(job[IMPORT_JOB_FIELDS.finishedAt]).not.toBeNull()
    expect(job[IMPORT_JOB_FIELDS.errorReport]).toMatchObject([{ code: 'queue_unavailable' }])
    expect(bucket.deletes).toHaveLength(1)
  })
})
