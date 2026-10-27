// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — an entry that other seeds reference, soft-deleted and restored, integration tier.
 * Covers what a referencing entry (a subscription pointing at a customer) sees while its target
 * sits in the Trash and once the target is restored, against real D1.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const customers = defineSeed({
  slug: 'rel_customers', label: 'Customer', displayNameAlias: 'name',
  branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true }],
})
const subscriptions = defineSeed({
  slug: 'rel_subscriptions', label: 'Subscription', displayNameAlias: 'tier',
  branches: [
    { id: 'br_01', alias: 'tier', label: 'Tier', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'customer', label: 'Customer', type: 'relation', targetSeed: 'rel_customers', onDelete: 'SET NULL' },
    { id: 'br_03', alias: 'watchers', label: 'Watchers', type: 'relation', targetSeed: 'rel_customers', multiple: true },
  ],
})

describe('content slice — referenced entry through the Trash (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let customerId: string
  let subscriptionId: string

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [customers, subscriptions],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')

    const customer = await admin.post('/api/content/rel_customers', { name: 'Acme', status: 'published' })
    customerId = (await customer.json<{ id: string }>()).id
    const subscription = await admin.post('/api/content/rel_subscriptions', {
      tier: 'Pro', customer: customerId, watchers: [customerId], status: 'published',
    })
    subscriptionId = (await subscription.json<{ id: string }>()).id
  })

  async function trashCustomer(): Promise<void> {
    const response = await admin.delete(`/api/content/rel_customers/${customerId}`)
    expect(response.status).toBe(200) // precondition
  }

  async function restoreCustomer(): Promise<Response> {
    return admin.post(`/api/content/rel_customers/${customerId}/restore`)
  }

  it('keeps both references on the subscription while the customer is in the Trash', async () => {
    await trashCustomer()

    const response = await admin.get(`/api/content/rel_subscriptions/${subscriptionId}`)

    expect(response.status).toBe(200)
    const body = await response.json<{ data: { customer: string | null; watchers: string[] } }>()
    expect(body.data.customer).toBe(customerId)
    expect(body.data.watchers).toEqual([customerId])
  })

  it('answers 404 for the trashed customer and 200 again once it is restored', async () => {
    await trashCustomer()
    const whileTrashed = await admin.get(`/api/content/rel_customers/${customerId}`)

    const restored = await restoreCustomer()
    const afterRestore = await admin.get(`/api/content/rel_customers/${customerId}`)

    expect(whileTrashed.status).toBe(404)
    expect(restored.status).toBe(200)
    expect(afterRestore.status).toBe(200)
  })

  it('labels the references again in the subscription list after the restore', async () => {
    await trashCustomer()
    await restoreCustomer()

    const response = await admin.get('/api/content/rel_subscriptions?page=1&limit=10')

    expect(response.status).toBe(200)
    const body = await response.json<{ relations: Record<string, Record<string, string>> }>()
    expect(body.relations.customer).toEqual({ [customerId]: 'Acme' })
    expect(body.relations.watchers).toEqual({ [customerId]: 'Acme' })
  })

  it('still reports the subscription as a back-reference of the restored customer', async () => {
    await trashCustomer()
    await restoreCustomer()

    const response = await admin.get(`/api/content/rel_customers/${customerId}/backrefs`)

    expect(response.status).toBe(200)
    const body = await response.json<{ groups: Array<{ sourceSlug: string; branchAlias: string; total: number }> }>()
    expect(body.groups.map(({ sourceSlug, branchAlias, total }) => ({ sourceSlug, branchAlias, total }))).toEqual([
      { sourceSlug: 'rel_subscriptions', branchAlias: 'customer', total: 1 },
      { sourceSlug: 'rel_subscriptions', branchAlias: 'watchers', total: 1 },
    ])
  })

  it('lets the subscription be edited while its customer is in the Trash', async () => {
    await trashCustomer()

    const response = await admin.put(`/api/content/rel_subscriptions/${subscriptionId}`, { tier: 'Team' })

    expect(response.status).toBe(200)
  })

  it('keeps the references through an edit made while the customer was in the Trash', async () => {
    await trashCustomer()
    await admin.put(`/api/content/rel_subscriptions/${subscriptionId}`, { tier: 'Team' })
    await restoreCustomer()

    const response = await admin.get(`/api/content/rel_subscriptions/${subscriptionId}`)

    const body = await response.json<{ data: { customer: string | null; watchers: string[] } }>()
    expect(body.data.customer).toBe(customerId)
    expect(body.data.watchers).toEqual([customerId])
  })
})
