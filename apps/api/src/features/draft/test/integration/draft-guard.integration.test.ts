// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Draft slice — live-entry guard, integration tier.
 * The guard only has to know the live entry exists: it must not load (and decrypt) the whole row,
 * and it keeps the trash visibility of `findById` (a trashed entry is not found).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { D1ContentRepository } from '../../../../shared/db/repositories/content.repository.d1'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const PROBLEM = 'https://beechcms.dev/problems/'

const draftsSeed = defineSeed({
  slug: 'dg_drafts',
  label: 'Drafts',
  labelPlural: 'Drafts',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
})

interface ProblemBody {
  type: string
}

/** Counts full-row reads so the test can prove the guard does not issue one. */
class FullRowReadCountingRepository extends D1ContentRepository {
  fullRowReads = 0

  override async findById(...args: Parameters<D1ContentRepository['findById']>) {
    this.fullRowReads += 1
    return super.findById(...args)
  }
}

describe('draft slice — live-entry guard (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let repository: FullRowReadCountingRepository

  beforeEach(async () => {
    __resetSeedRegistryCache()
    repository = new FullRowReadCountingRepository(env.DB)
    harness = await createTestHarness({
      db: env.DB,
      seeds: [draftsSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders, repository }),
    })
    admin = await harness.asUser('admin')
  })

  async function createPost(slug: string): Promise<string> {
    const created = await admin.post('/api/content/dg_drafts', { title: 'Original', slug, status: 'published' })
    return (await created.json<{ id: string }>()).id
  }

  it('a live entry without a draft answers 404 draft-not-found with no full-row read in the guard', async () => {
    const id = await createPost('dg-live')
    const readsBefore = repository.fullRowReads

    const response = await admin.get(`/api/content/dg_drafts/${id}/draft`)

    expect(response.status).toBe(404)
    const body = await response.json<ProblemBody>()
    expect(body.type).toBe(`${PROBLEM}draft-not-found`)
    expect(repository.fullRowReads).toBe(readsBefore)
  })

  it('a trashed entry answers 404 content-not-found on the draft routes', async () => {
    const id = await createPost('dg-trashed')
    const deleted = await admin.delete(`/api/content/dg_drafts/${id}`)
    expect(deleted.status).toBe(200)

    const response = await admin.get(`/api/content/dg_drafts/${id}/draft`)

    expect(response.status).toBe(404)
    const body = await response.json<ProblemBody>()
    expect(body.type).toBe(`${PROBLEM}content-not-found`)
  })
})
