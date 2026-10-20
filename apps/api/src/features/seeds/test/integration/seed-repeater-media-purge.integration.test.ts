// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — repeater and JSON media purge integration tier (real D1 and R2).
 * Proves that hard-deleting a seed containing media URLs in `repeater` and `json` branches
 * extracts, stages, and purges all referenced R2 media rather than leaking untracked
 * files when tables are dropped (issue #776).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, generateSeedPurgeGuards, SystemIdGenerator } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { D1SeedMediaPurgeRepository } from '../../../../shared/db/repositories/seed-media-purge.repository.d1'
import { R2BucketAdapter } from '../../../../shared/storage/r2-bucket'
import { runSeedMediaPurgeStep } from '../../seed-media-purge'

const repeaterMediaSeed = defineSeed({
  slug: 'portfolio_media',
  label: 'Portfolio Media',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    {
      id: 'br_02',
      alias: 'slides',
      label: 'Slides',
      type: 'repeater',
      fields: [
        { id: 'br_03', alias: 'caption', label: 'Caption', type: 'text' },
        { id: 'br_04', alias: 'image_url', label: 'Image URL', type: 'text' },
      ],
    },
    {
      id: 'br_05',
      alias: 'metadata',
      label: 'Metadata',
      type: 'json',
    },
  ],
})

describe('seeds slice — repeater and json media purge (real D1 and R2)', () => {
  let harness: TestHarness
  let admin: TestClient
  let bucket: R2BucketAdapter
  let repository: D1SeedMediaPurgeRepository

  beforeEach(async () => {
    for (const sql of generateSeedPurgeGuards(repeaterMediaSeed).drop) await env.DB.prepare(sql).run()
    await env.DB.prepare('DELETE FROM seed_media_purge_jobs').run()
    await env.DB.prepare("DELETE FROM media_objects WHERE key IN ('slide1.png', 'slide2.png', 'cover.png')").run()
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [repeaterMediaSeed],
      env: { MEDIA_BUCKET: (env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    await env.DB.prepare("UPDATE seeds SET source = 'runtime' WHERE slug = 'portfolio_media'").run()
    admin = await harness.asUser('admin')
    bucket = new R2BucketAdapter((env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET, 'http://localhost')
    repository = new D1SeedMediaPurgeRepository(env.DB)
  })

  async function arrangeMedia(): Promise<string> {
    await env.MEDIA_BUCKET.put('slide1.png', 'slide1-content')
    await env.MEDIA_BUCKET.put('slide2.png', 'slide2-content')
    await env.MEDIA_BUCKET.put('cover.png', 'cover-content')
    await env.DB.prepare(`INSERT INTO media_objects (key, filename, mime_type, size_bytes)
      VALUES ('slide1.png', 'slide1.png', 'image/png', 10),
             ('slide2.png', 'slide2.png', 'image/png', 10),
             ('cover.png', 'cover.png', 'image/png', 10)`).run()

    const created = await admin.post('/api/content/portfolio_media', {
      title: 'Project Showcase',
      slides: [
        { caption: 'First Slide', image_url: 'http://localhost/api/media/slide1.png' },
        { caption: 'Second Slide', image_url: 'http://localhost/api/media/slide2.png' },
      ],
      metadata: {
        coverImage: 'http://localhost/api/media/cover.png',
      },
    })
    if (created.status !== 201) throw new Error(`content create returned ${created.status}: ${await created.text()}`)
    const { id } = await created.json<{ id: string }>()
    return id
  }

  async function drainPurge(jobId: string): Promise<boolean> {
    let more = true
    for (let step = 0; step < 10 && more; step++) {
      more = await runSeedMediaPurgeStep(jobId, {
        repository,
        bucket,
        clock: harness.clock,
        idGenerator: SystemIdGenerator,
      })
    }
    return more
  }

  it('stages and purges media keys stored inside repeater and json branches (issue #776)', async () => {
    await arrangeMedia()

    const accepted = await admin.delete('/api/seeds/portfolio_media/hard', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'portfolio_media' }),
    })

    expect(accepted.status).toBe(202)
    const { jobId } = await accepted.json<{ jobId: string }>()

    const more = await drainPurge(jobId)

    expect(more).toBe(false)
    const job = await repository.get(jobId)
    expect(job?.phase).toBe('done')
    expect(job?.stagedCount).toBe(3)
    expect(job?.purgedCount).toBe(3)

    expect(await env.MEDIA_BUCKET.get('slide1.png')).toBeNull()
    expect(await env.MEDIA_BUCKET.get('slide2.png')).toBeNull()
    expect(await env.MEDIA_BUCKET.get('cover.png')).toBeNull()

    const tables = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sqlite_master
      WHERE name IN ('content_portfolio_media', 'content_portfolio_media_drafts')`).first<{ n: number }>()
    expect(tables?.n).toBe(0)
  })
})
