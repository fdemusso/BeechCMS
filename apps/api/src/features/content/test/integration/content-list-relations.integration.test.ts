// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — list `relations` label map, integration tier. Covers `GET /api/content/:slug`
 * against real D1: multi-relation branches get labels, and a target whose label field is
 * concealed never leaks it through the map (#573 items 1).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SECRET_LABEL = 'TOPSECRET-573'

const openTargetSeed = defineSeed({
  slug: 'rel_open_targets', label: 'Open Target', displayNameAlias: 'name',
  branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true }],
})
const hiddenTargetSeed = defineSeed({
  slug: 'rel_hidden_targets', label: 'Hidden Target', displayNameAlias: 'name',
  branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true, policies: { visibility: 'hidden' } }],
})
const sourceSeed = defineSeed({
  slug: 'rel_sources', label: 'Source', displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'rel_open_targets', multiple: true },
    { id: 'br_03', alias: 'secret_ref', label: 'Secret ref', type: 'relation', targetSeed: 'rel_hidden_targets' },
  ],
})

describe('content slice — list relations map (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [openTargetSeed, hiddenTargetSeed, sourceSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  async function createEntry(slug: string, data: Record<string, unknown>): Promise<string> {
    const response = await admin.post(`/api/content/${slug}`, { ...data, status: 'published' })
    expect(response.status).toBe(201) // precondition
    const { id } = await response.json<{ id: string }>()
    return id
  }

  it('labels every id of a multi-relation branch', async () => {
    const redId = await createEntry('rel_open_targets', { name: 'Red' })
    const blueId = await createEntry('rel_open_targets', { name: 'Blue' })
    await createEntry('rel_sources', { title: 'Shoe', tags: [redId, blueId] })

    const response = await admin.get('/api/content/rel_sources?page=1&limit=10')

    expect(response.status).toBe(200)
    const body = await response.json<{ relations: { tags: Record<string, string> } }>()
    expect(body.relations.tags).toEqual({ [redId]: 'Red', [blueId]: 'Blue' })
  })

  it('never exposes a hidden target label through the relations map', async () => {
    const targetId = await createEntry('rel_hidden_targets', { name: SECRET_LABEL })
    await createEntry('rel_sources', { title: 'Shoe', secret_ref: targetId })

    const response = await admin.get('/api/content/rel_sources?page=1&limit=10')

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain(SECRET_LABEL)
  })
})
