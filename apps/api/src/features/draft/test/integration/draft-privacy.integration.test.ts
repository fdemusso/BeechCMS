// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Draft slice — privacy integration tier. PUT .../draft must accept `encrypt` fields exactly like
 * the live update does (stored encrypted, restored on publish) and keep rejecting `hash` fields (#579).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, type Branch } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SLUG = 'dp_people'
const SSN = '123-45-6789'

const seed = defineSeed({
  slug: SLUG,
  label: SLUG,
  labelPlural: SLUG,
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true } as Branch,
    { id: 'br_02', alias: 'ssn', label: 'SSN', type: 'text', policies: { privacy: 'encrypt' } } as Branch,
    { id: 'br_03', alias: 'pin', label: 'PIN', type: 'text', policies: { privacy: 'hash' } } as Branch,
  ],
})

describe('draft slice — privacy policies (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let entryId: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [seed],
      env: {
        MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET,
        PRIVACY_MASTER_KEY: 'test-master-key-32-chars-minimum-1234567890',
      },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    const created = await admin.post(`/api/content/${SLUG}`, { title: 'Alice', slug: 'alice', status: 'published' })
    expect(created.status).toBe(201) // precondition
    entryId = (await created.json<{ id: string }>()).id
  })

  async function rawDraftSsn(): Promise<string | null> {
    const row = await harness.db
      .prepare(`SELECT ssn FROM content_${SLUG}_drafts WHERE entry_id = ?`)
      .bind(entryId)
      .first<{ ssn: string | null }>()
    return row?.ssn ?? null
  }

  it('accepts an encrypt field that the live update also accepts', async () => {
    const live = await admin.put(`/api/content/${SLUG}/${entryId}`, { title: 'Alice', ssn: SSN })
    expect(live.status).toBe(200) // precondition: live update allows encrypt

    const draft = await admin.put(`/api/content/${SLUG}/${entryId}/draft`, { title: 'Alice', ssn: SSN })

    expect(draft.status).toBe(200)
  })

  it('stores the drafted encrypt value encrypted, then restores it on publish', async () => {
    const draft = await admin.put(`/api/content/${SLUG}/${entryId}/draft`, { ssn: SSN })
    expect(draft.status).toBe(200) // precondition

    const stored = await rawDraftSsn()
    expect(stored?.startsWith('v1:')).toBe(true)
    expect(stored).not.toContain(SSN)

    const published = await admin.post(`/api/content/${SLUG}/${entryId}/draft/publish`, {})
    expect(published.status).toBe(200)
    const detail = await admin.get(`/api/content/${SLUG}/${entryId}`)
    expect((await detail.json<{ data: { ssn: string } }>()).data.ssn).toBe(SSN)
  })

  it('still rejects a hash field and persists no draft', async () => {
    const draft = await admin.put(`/api/content/${SLUG}/${entryId}/draft`, { pin: '4321' })

    expect(draft.status).toBe(422)
    expect(await rawDraftSsn()).toBeNull()
  })
})
