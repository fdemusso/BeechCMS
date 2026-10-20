// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Seed schema writes must keep DDL, the stored definition, and the registry version together. */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { SystemIdGenerator } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { D1SeedMediaPurgeRepository } from '../../../../shared/db/repositories/seed-media-purge.repository.d1'
import { R2BucketAdapter } from '../../../../shared/storage/r2-bucket'
import { runSeedMediaPurgeStep } from '../../seed-media-purge'

describe('seeds slice — schema atomicity (real D1)', () => {
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

  async function createSeed(slug: string, withNote: boolean) {
    const response = await admin.post('/api/seeds', {
      slug,
      label: slug,
      branches: [
        { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
        ...(withNote ? [{ alias: 'note', label: 'Note', type: 'text' }] : []),
      ],
    })
    expect(response.status).toBe(201)
  }

  async function version() {
    const row = await harness.db.prepare("SELECT value FROM seed_meta WHERE id = 'registry_version'").first<{ value: string }>()
    return row?.value
  }

  async function columns(slug: string) {
    const rows = await harness.db.prepare(`PRAGMA table_info(content_${slug})`).all<{ name: string }>()
    return rows.results.map(row => row.name)
  }

  async function storedBranches(slug: string) {
    const row = await harness.db.prepare('SELECT definition FROM seeds WHERE slug = ?').bind(slug).first<{ definition: string }>()
    if (!row) return null
    const definition = JSON.parse(row.definition) as { branches: Array<{ id: string; alias: string }> }
    return definition.branches
  }

  it('keeps the dropped column when definition persistence fails', async () => {
    await createSeed('atomic_drop', true)
    const note = (await storedBranches('atomic_drop'))?.find(branch => branch.alias === 'note')
    if (!note) throw new Error('note branch not found')
    const before = await version()
    // A later write failure must roll back the earlier destructive DDL.
    await harness.db.prepare(`CREATE TRIGGER IF NOT EXISTS fail_seed_update_drop BEFORE UPDATE ON seeds
      WHEN OLD.slug = 'atomic_drop' BEGIN SELECT RAISE(ABORT, 'injected persistence failure'); END`).run()

    const response = await admin.delete(`/api/seeds/atomic_drop/branches/${note.id}`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'atomic_drop.note' }),
    })

    expect([422, 500]).toContain(response.status)
    expect((await storedBranches('atomic_drop'))?.map(branch => branch.alias)).toContain('note')
    expect(await version()).toBe(before)
    expect(await columns('atomic_drop')).toContain('note')
  })

  it('keeps an additive column absent when definition persistence fails', async () => {
    await createSeed('atomic_add', false)
    const before = await version()
    await harness.db.prepare(`CREATE TRIGGER IF NOT EXISTS fail_seed_update_add BEFORE UPDATE ON seeds
      WHEN OLD.slug = 'atomic_add' BEGIN SELECT RAISE(ABORT, 'injected persistence failure'); END`).run()

    const response = await admin.post('/api/seeds/atomic_add/branches', {
      alias: 'note', label: 'Note', type: 'text',
    })

    expect([422, 500]).toContain(response.status)
    expect((await storedBranches('atomic_add'))?.map(branch => branch.alias)).not.toContain('note')
    expect(await version()).toBe(before)
    expect(await columns('atomic_add')).not.toContain('note')
  })

  it('keeps the content table and restores the seed when the purge DROP batch fails', async () => {
    await createSeed('atomic_hard', false)
    await harness.db.prepare(`CREATE TRIGGER IF NOT EXISTS fail_seed_delete_hard BEFORE DELETE ON seeds
      WHEN OLD.slug = 'atomic_hard' BEGIN SELECT RAISE(ABORT, 'injected persistence failure'); END`).run()

    // Hard delete is accepted as a durable job; the DROP runs (and fails) in the background step.
    const response = await admin.delete('/api/seeds/atomic_hard/hard', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'atomic_hard' }),
    })
    expect(response.status).toBe(202)
    const { jobId } = await response.json<{ jobId: string }>()

    const repository = new D1SeedMediaPurgeRepository(env.DB)
    const bucket = new R2BucketAdapter((env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET, 'http://localhost')
    const more = await runSeedMediaPurgeStep(jobId, {
      repository, bucket, clock: harness.clock, idGenerator: SystemIdGenerator,
    })

    expect(more).toBe(false)
    expect((await repository.get(jobId))?.phase).toBe('failed')
    expect(await storedBranches('atomic_hard')).not.toBeNull()
    const seed = await harness.db.prepare("SELECT status FROM seeds WHERE slug = 'atomic_hard'").first<{ status: string }>()
    expect(seed?.status).toBe('active')
    expect(await columns('atomic_hard')).toContain('title')
  })
})
