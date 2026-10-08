// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seed-scoped template refs — integration tier. `{{customers:byid(x):field}}` is part of the
 * documented template grammar but the resolver had no repository access, so every such ref
 * resolved to undefined (#564). The resolver unit tests only cover `this` and `batch`, and a
 * mocked `findMany` would never prove the id / alias filters bind in the real query builder.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, type Automation, type Branch, type Seed } from '@beechcms/core'
import { createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { D1ContentRepository } from '../../../../shared/db/repositories/content.repository.d1'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { resolveAutomationContext } from '../../evaluator/context-resolver'
import { interpolate } from '../../engine/automation-runner.utils'
import { evaluateWhen } from '../../filters/when-evaluator'

const customersSeed = defineSeed({
  slug: 'ssr_customers',
  label: 'ssr_customers',
  labelPlural: 'ssr_customers',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true } as Branch,
    { id: 'br_02', alias: 'tier', label: 'Tier', type: 'text' } as Branch,
    { id: 'br_03', alias: 'credit', label: 'Credit', type: 'number' } as Branch,
  ],
})

const ordersSeed = defineSeed({
  slug: 'ssr_orders',
  label: 'ssr_orders',
  labelPlural: 'ssr_orders',
  displayNameAlias: 'title',
  branches: [{ id: 'br_11', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true } as Branch],
})

function makeAutomation(overrides: Partial<Automation>): Automation {
  return {
    id: 'auto-1',
    seed_slug: 'ssr_orders',
    name: 'test',
    enabled: true,
    triggers: [{ event: 'create' }],
    trigger_conditions: null,
    actions: [],
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

describe('resolveAutomationContext — seed-scoped refs (real D1)', () => {
  let harness: TestHarness
  let repository: D1ContentRepository
  let adaId: string

  const seeds: Seed[] = [customersSeed, ordersSeed]
  const getSeed = (slug: string): Seed | null => seeds.find((s) => s.slug === slug) ?? null

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    repository = new D1ContentRepository(env.DB)

    const admin = await harness.asUser('admin')
    const ada = await admin.post('/api/content/ssr_customers', { name: 'Ada', slug: 'ssr-ada', tier: 'gold', credit: 500 })
    const bob = await admin.post('/api/content/ssr_customers', { name: 'Bob', slug: 'ssr-bob', tier: 'silver', credit: 100 })
    expect(ada.status).toBe(201)
    expect(bob.status).toBe(201)
    adaId = (await ada.json<{ id: string }>()).id
  })

  const resolve = (automation: Automation) =>
    resolveAutomationContext(automation, { id: 'order-1' }, [{ id: 'order-1' }], { repository, getSeed })

  it('a byid ref in a send_mail body resolves to the named entry field', async () => {
    const automation = makeAutomation({
      actions: [{ type: 'send_mail', to: 'a@example.com', subject_template: 's', body_template: `Hi {{ssr_customers:byid(${adaId}):name}}` }],
    })

    const context = await resolve(automation)

    const body = interpolate(`Hi {{ssr_customers:byid(${adaId}):name}}`, context, { escape: 'html' })
    expect(body).toBe('Hi Ada')
  })

  it('a where ref resolves to the entry matching the alias value', async () => {
    const automation = makeAutomation({
      actions: [{ type: 'edit_field', field: 'title', value: '{{ssr_customers:where(tier=silver):name}}' }],
    })

    const context = await resolve(automation)

    expect(interpolate('{{ssr_customers:where(tier=silver):name}}', context, { escape: 'none' })).toBe('Bob')
  })

  it('a cross-seed predicate in trigger_conditions compares the looked-up value', async () => {
    const when = (threshold: number) => makeAutomation({
      trigger_conditions: {
        kind: 'predicate',
        left: { kind: 'ref', key: `ssr_customers:byid(${adaId}):credit` },
        op: 'gt',
        right: { kind: 'literal', value: threshold },
      },
    })

    const above = await resolve(when(400))
    const below = await resolve(when(900))

    expect(evaluateWhen(when(400).trigger_conditions, above)).toBe(true)
    expect(evaluateWhen(when(900).trigger_conditions, below)).toBe(false)
  })

  it('an aggregate over a seed counts and sums the stored entries', async () => {
    const automation = makeAutomation({
      actions: [{ type: 'edit_field', field: 'title', value: '{{ssr_customers:all:count}} {{ssr_customers:all:sum:credit}}' }],
    })

    const context = await resolve(automation)

    expect(interpolate('{{ssr_customers:all:count}} {{ssr_customers:all:sum:credit}}', context, { escape: 'none' })).toBe('2 600')
  })

  it('a ref to an unknown seed renders the default value and reports the scope missing once', async () => {
    const automation = makeAutomation({
      actions: [{ type: 'edit_field', field: 'title', value: '{{ghosts:byid(x):name}}' }],
    })
    const missing: string[] = []

    const context = await resolve(automation)
    const out = interpolate('{{ghosts:byid(x):name}}', context, { escape: 'none', defaultValue: 'n/a', onMissing: (f) => missing.push(f) })

    expect(out).toBe('n/a')
    expect(missing).toEqual(['ghosts'])
  })
})
