// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Seed hard deletion through HTTP and its durable background continuation against real D1 and R2. */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, generateSeedPurgeGuards, SystemIdGenerator } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { D1SeedMediaPurgeRepository } from '../../../../shared/db/repositories/seed-media-purge.repository.d1'
import { R2BucketAdapter } from '../../../../shared/storage/r2-bucket'
import { runSeedMediaPurgeStep } from '../../seed-media-purge'

// The canonical posts seed has an inbound self-relation, which deliberately blocks hard deletion.
const mediaSeed = defineSeed({
  slug: 'purge_articles', label: 'Purge Article', displayNameAlias: 'title', allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'image', label: 'Image', type: 'file' },
  ],
})

describe('seeds slice — media purge (real D1 and R2)', () => {
  let harness: TestHarness
  let admin: TestClient
  let bucket: R2BucketAdapter
  let repository: D1SeedMediaPurgeRepository

  beforeEach(async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS purge_blocker').run()
    // D1 persists for the file; a pending job's guards must be removed before harness reset.
    for (const sql of generateSeedPurgeGuards(mediaSeed).drop) await env.DB.prepare(sql).run()
    await env.DB.prepare('DELETE FROM seed_media_purge_jobs').run()
    await env.DB.prepare("DELETE FROM media_objects WHERE key IN ('live.png', 'draft.png')").run()
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB, seeds: [mediaSeed],
      env: { MEDIA_BUCKET: (env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET },
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    // The harness provisions definitions as manifest-owned; this route requires a runtime seed.
    await env.DB.prepare("UPDATE seeds SET source = 'runtime' WHERE slug = 'purge_articles'").run()
    admin = await harness.asUser('admin')
    bucket = new R2BucketAdapter((env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET, 'http://localhost')
    repository = new D1SeedMediaPurgeRepository(env.DB)
  })

  async function arrangeMedia(): Promise<string> {
    await env.MEDIA_BUCKET.put('live.png', 'live')
    await env.MEDIA_BUCKET.put('draft.png', 'draft')
    await env.DB.prepare(`INSERT INTO media_objects (key, filename, mime_type, size_bytes)
      VALUES ('live.png', 'live.png', 'image/png', 4), ('draft.png', 'draft.png', 'image/png', 5)`).run()
    const created = await admin.post('/api/content/purge_articles', {
      title: 'Article', slug: 'article', image: 'http://localhost/api/media/live.png',
    })
    if (created.status !== 201) throw new Error(`content create returned ${created.status}: ${await created.text()}`)
    const { id } = await created.json<{ id: string }>()
    const draft = await admin.put(`/api/content/purge_articles/${id}/draft`, { image: 'http://localhost/api/media/draft.png' })
    if (draft.status !== 200) throw new Error(`draft save returned ${draft.status}: ${await draft.text()}`)
    return id
  }

  async function drainPurge(jobId: string): Promise<boolean> {
    let more = true
    for (let step = 0; step < 10 && more; step++) {
      more = await runSeedMediaPurgeStep(jobId, {
        repository, bucket, clock: harness.clock, idGenerator: SystemIdGenerator,
      })
    }
    return more
  }

  it('accepts hard deletion with 202 while keeping both tables and media until staging finishes', async () => {
    await arrangeMedia()

    const response = await admin.delete('/api/seeds/purge_articles/hard', {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'purge_articles' }),
    })

    if (response.status !== 202) throw new Error(`seed purge returned ${response.status}: ${await response.text()}`)
    expect(response.status).toBe(202)
    const body = await response.json<{ jobId: string; status: string }>()
    expect(body.status).toBe('pending')
    expect(response.headers.get('Location')).toBe(`/api/seeds/purges/${body.jobId}`)

    const stored = await repository.get(body.jobId)
    expect(stored?.phase).toBe('live')
    const seed = await env.DB.prepare('SELECT status FROM seeds WHERE slug = ?').bind('purge_articles')
      .first<{ status: string }>()
    expect(seed?.status).toBe('deleted')
    expect(await env.MEDIA_BUCKET.get('live.png')).not.toBeNull()
    expect(await env.MEDIA_BUCKET.get('draft.png')).not.toBeNull()
  })

  it('stages live and draft keys before DROP, then purges both through bounded background steps', async () => {
    await arrangeMedia()
    const accepted = await admin.delete('/api/seeds/purge_articles/hard', {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'purge_articles' }),
    })
    if (accepted.status !== 202) throw new Error(`seed purge returned ${accepted.status}: ${await accepted.text()}`)
    const { jobId } = await accepted.json<{ jobId: string }>()

    const more = await drainPurge(jobId)

    expect(more).toBe(false)
    const job = await repository.get(jobId)
    expect(job?.phase).toBe('done')
    expect(job?.stagedCount).toBe(2)
    expect(job?.purgedCount).toBe(2)
    const table = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sqlite_master
      WHERE name IN ('content_purge_articles', 'content_purge_articles_drafts')`).first<{ n: number }>()
    expect(table?.n).toBe(0)
    expect(await env.MEDIA_BUCKET.get('live.png')).toBeNull()
    expect(await env.MEDIA_BUCKET.get('draft.png')).toBeNull()
    const media = await env.DB.prepare(`SELECT COUNT(*) AS n FROM media_objects
      WHERE key IN ('live.png', 'draft.png')`).first<{ n: number }>()
    expect(media?.n).toBe(0)
  })

  it('persists a row cursor after one page while later rows and media remain intact', async () => {
    await arrangeMedia()
    for (let index = 0; index < 100; index++) {
      const created = await admin.post('/api/content/purge_articles', {
        title: `Extra ${index}`, slug: `extra-${index}`,
      })
      if (created.status !== 201) throw new Error(`extra content create returned ${created.status}`)
    }
    const accepted = await admin.delete('/api/seeds/purge_articles/hard', {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'purge_articles' }),
    })
    if (accepted.status !== 202) throw new Error(`seed purge returned ${accepted.status}`)
    const { jobId } = await accepted.json<{ jobId: string }>()

    const more = await runSeedMediaPurgeStep(jobId, { repository, bucket, clock: harness.clock,
      idGenerator: SystemIdGenerator })

    expect(more).toBe(true)
    const job = await repository.get(jobId)
    expect(job?.phase).toBe('live')
    expect(job?.cursor).toBeGreaterThan(0)
    expect(job?.stagedCount).toBe(1)
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_purge_articles').first<{ n: number }>()
    expect(rows?.n).toBe(101)
    expect(await env.MEDIA_BUCKET.get('live.png')).not.toBeNull()
  })

  it('restores the seed and preserves media when the atomic table drop fails', async () => {
    const entryId = await arrangeMedia()
    // A real FK blocker makes the generated DROP batch fail after draft-table statements begin.
    await env.DB.prepare(`CREATE TABLE purge_blocker (
      id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES content_purge_articles(id))`).run()
    await env.DB.prepare('INSERT INTO purge_blocker (id, article_id) VALUES (?, ?)')
      .bind('block', entryId).run()
    const accepted = await admin.delete('/api/seeds/purge_articles/hard', {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'purge_articles' }),
    })
    if (accepted.status !== 202) throw new Error(`seed purge returned ${accepted.status}: ${await accepted.text()}`)
    const { jobId } = await accepted.json<{ jobId: string }>()

    const result = await drainPurge(jobId)

    expect(result).toBe(false)
    expect((await repository.get(jobId))?.phase).toBe('failed')
    const seed = await env.DB.prepare('SELECT status FROM seeds WHERE slug = ?').bind('purge_articles')
      .first<{ status: string }>()
    expect(seed?.status).toBe('active')
    const tables = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sqlite_master
      WHERE name IN ('content_purge_articles', 'content_purge_articles_drafts')`).first<{ n: number }>()
    expect(tables?.n).toBe(2)
    expect(await env.MEDIA_BUCKET.get('live.png')).not.toBeNull()
    expect(await env.MEDIA_BUCKET.get('draft.png')).not.toBeNull()
  })
})
