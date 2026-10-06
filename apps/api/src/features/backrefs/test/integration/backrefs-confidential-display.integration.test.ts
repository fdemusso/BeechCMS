// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Backrefs slice — encrypted display names, integration tier (#566). A source seed whose display
 * column is `confidential` stores `v1:<iv>:<ct>` in D1; the backrefs endpoint must return the
 * decrypted name, like the content repository and the widget slice do. Unit tests use plain display
 * fields and a fake repository, so they cannot see the raw ciphertext leaking through.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, type Branch } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const MASTER_KEY = 'test-master-key-32-chars-minimum-1234567890'

const companiesSeed = defineSeed({
  slug: 'cd_br_companies', label: 'Company', displayNameAlias: 'name',
  branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text' }],
})
const customersSeed = defineSeed({
  slug: 'cd_br_customers', label: 'Customer', displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', policies: { classification: 'confidential' } } as Branch,
    { id: 'br_02', alias: 'company_id', label: 'Company', type: 'relation', targetSeed: 'cd_br_companies' },
  ],
})

describe('backrefs slice — confidential display name (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let companyId: string
  let customerId: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [companiesSeed, customersSeed],
      env: { PRIVACY_MASTER_KEY: MASTER_KEY },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    const company = await admin.post('/api/content/cd_br_companies', { name: 'Acme', status: 'published' })
    expect(company.status).toBe(201) // precondition
    companyId = (await company.json<{ id: string }>()).id
    const customer = await admin.post('/api/content/cd_br_customers', {
      name: 'Grace Hopper',
      company_id: companyId,
      status: 'published',
    })
    expect(customer.status).toBe(201) // precondition
    customerId = (await customer.json<{ id: string }>()).id
  })

  it('lists the decrypted display name of an encrypted source column', async () => {
    const stored = await harness.db
      .prepare('SELECT name FROM content_cd_br_customers WHERE id = ?')
      .bind(customerId)
      .first<{ name: string }>()
    expect(stored?.name.startsWith('v1:')).toBe(true) // precondition: stored encrypted

    const response = await admin.get(`/api/content/cd_br_companies/${companyId}/backrefs`)

    expect(response.status).toBe(200)
    const body = await response.json<{ groups: { items: { id: string; displayName: string | null }[] }[] }>()
    expect(body.groups[0]?.items).toEqual([expect.objectContaining({ id: customerId, displayName: 'Grace Hopper' })])
  })

  it('lists the decrypted display name in the paginated single-group view', async () => {
    const response = await admin.get(`/api/content/cd_br_companies/${companyId}/backrefs?group=cd_br_customers:company_id`)

    expect(response.status).toBe(200)
    const body = await response.json<{ groups: { items: { displayName: string | null }[] }[] }>()
    expect(body.groups[0]?.items[0]?.displayName).toBe('Grace Hopper')
  })
})
