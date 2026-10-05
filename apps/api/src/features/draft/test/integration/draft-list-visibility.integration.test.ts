// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Draft slice — integration tier. GET /drafts must resolve the display-name column through
 * the same visibility pipeline as detail reads: hidden, masked and encrypted titles never
 * reach the response as plaintext or ciphertext (#578).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, type Branch } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SECRET = 'TOPSECRET-578'

function titleSeed(slug: string, titleBranch: Partial<Branch>) {
  return defineSeed({
    slug,
    label: slug,
    labelPlural: slug,
    displayNameAlias: 'title',
    allowDrafts: true,
    branches: [
      { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, ...titleBranch } as Branch,
    ],
  })
}

const hiddenSeed = titleSeed('dl_hidden', { policies: { visibility: 'hidden' } })
const maskedSeed = titleSeed('dl_masked', { policies: { visibility: 'masked' } })
const encryptedSeed = titleSeed('dl_encrypted', { policies: { privacy: 'encrypt' } })
const plainSeed = titleSeed('dl_plain', {})

describe('draft slice — list visibility (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  const ids: Record<string, string> = {}

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [hiddenSeed, maskedSeed, encryptedSeed, plainSeed],
      env: {
        MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET,
        PRIVACY_MASTER_KEY: 'test-master-key-32-chars-minimum-1234567890',
      },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    for (const slug of ['dl_hidden', 'dl_masked', 'dl_encrypted', 'dl_plain']) {
      const title = slug === 'dl_plain' ? 'Visible title' : SECRET
      const created = await admin.post(`/api/content/${slug}`, { title, slug: `${slug}-entry`, status: 'draft' })
      expect(created.status).toBe(201)
      ids[slug] = (await created.json<{ id: string }>()).id
    }
  })

  async function titles(): Promise<{ raw: string; bySeed: Record<string, string> }> {
    const response = await admin.get('/api/content/drafts')
    expect(response.status).toBe(200)
    const raw = await response.text()
    const rows = JSON.parse(raw) as Array<{ seedSlug: string; title: string }>
    return { raw, bySeed: Object.fromEntries(rows.map((row) => [row.seedSlug, row.title])) }
  }

  it('never returns hidden, masked or encrypted display-name values', async () => {
    const { raw } = await titles()

    expect(raw).not.toContain(SECRET)
  })

  it('falls back to the entry id when the title is concealed', async () => {
    const { bySeed } = await titles()

    expect(bySeed.dl_hidden).toBe(ids.dl_hidden)
    expect(bySeed.dl_encrypted).toBe(ids.dl_encrypted)
  })

  it('keeps a visible plain title intact', async () => {
    const { bySeed } = await titles()

    expect(bySeed.dl_plain).toBe('Visible title')
  })
})
