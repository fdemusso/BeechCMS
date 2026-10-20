// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — integration tier. Hidden/masked branch values must not appear anywhere in
 * the get/list/trash response body, not only inside the nested `data` envelope (#570).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SECRET = 'TOPSECRET-570'
const PHONE = '+391234567890'

const leakSeed = defineSeed({
  slug: 'leak_contacts',
  label: 'Leak Contact',
  labelPlural: 'Leak Contacts',
  displayNameAlias: 'title',
  softDelete: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'secret', label: 'Secret', type: 'text', policies: { visibility: 'hidden' } },
    { id: 'br_03', alias: 'phone', label: 'Phone', type: 'text', policies: { visibility: 'masked' } },
  ],
})

function expectNoLeak(raw: string) {
  expect(raw).not.toContain(SECRET)
  expect(raw).not.toContain(PHONE)
}

describe('content slice — response envelope visibility (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let id: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [leakSeed],
      env: { MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    const created = await admin.post('/api/content/leak_contacts', {
      title: 'Leaky',
      slug: 'leaky',
      secret: SECRET,
      phone: PHONE,
    })
    expect(created.status).toBe(201)
    ;({ id } = await created.json<{ id: string }>())
  })

  it('GET /:slug/:id keeps hidden and masked values out of the whole body', async () => {
    const response = await admin.get(`/api/content/leak_contacts/${id}`)

    expect(response.status).toBe(200)
    expectNoLeak(await response.text())
  })

  it('GET /:slug/by-slug/:entry keeps hidden and masked values out of the whole body', async () => {
    const response = await admin.get('/api/content/leak_contacts/by-slug/leaky')

    expect(response.status).toBe(200)
    expectNoLeak(await response.text())
  })

  it('GET /:slug (legacy array and paginated) keeps hidden and masked values out of the whole body', async () => {
    const legacy = await admin.get('/api/content/leak_contacts')
    const paged = await admin.get('/api/content/leak_contacts?page=1&limit=10')

    expect(legacy.status).toBe(200)
    expect(paged.status).toBe(200)
    expectNoLeak(await legacy.text())
    expectNoLeak(await paged.text())
  })

  it('GET /:slug/trash keeps hidden and masked values out of the whole body, retaining deleted_at', async () => {
    await admin.delete(`/api/content/leak_contacts/${id}`)

    const response = await admin.get('/api/content/leak_contacts/trash')

    expect(response.status).toBe(200)
    const raw = await response.text()
    expectNoLeak(raw)
    const body = JSON.parse(raw) as { items: Array<{ id: string; deleted_at: number }> }
    expect(body.items[0]?.id).toBe(id)
    expect(typeof body.items[0]?.deleted_at).toBe('number')
  })
})
