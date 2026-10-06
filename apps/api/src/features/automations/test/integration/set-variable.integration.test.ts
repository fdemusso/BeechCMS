// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * set_variable executor — integration tier. A filter whose interpolated value cannot be bound for
 * the field type used to be dropped by the query builder, so the read ran unconstrained and
 * `lastone` was an unrelated row (#559). The executor unit test mocks `findMany` and asserts the
 * filter object, so it never sees the SQL the real repository runs.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, type Branch, type Seed } from '@beechcms/core'
import { createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { D1ContentRepository } from '../../../../shared/db/repositories/content.repository.d1'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { resolveAutomationContext } from '../../evaluator/context-resolver'
import { executeSetVariable } from '../../executors/set-variable.executor'

const customersSeed = defineSeed({
  slug: 'sv_customers',
  label: 'sv_customers',
  labelPlural: 'sv_customers',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true } as Branch,
    { id: 'br_02', alias: 'email', label: 'Email', type: 'text' } as Branch,
    { id: 'br_03', alias: 'customer_no', label: 'Customer No', type: 'number' } as Branch,
    { id: 'br_04', alias: 'since', label: 'Since', type: 'date' } as Branch,
  ],
})

describe('executeSetVariable — integration (real D1)', () => {
  let harness: TestHarness
  let repository: D1ContentRepository

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [customersSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    repository = new D1ContentRepository(env.DB)

    const admin = await harness.asUser('admin')
    const first = await admin.post('/api/content/sv_customers', { name: 'Ada', slug: 'sv-ada', email: 'ada@example.com', customer_no: 1 })
    const second = await admin.post('/api/content/sv_customers', { name: 'Bob', slug: 'sv-bob', email: 'bob@example.com', customer_no: 2 })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
  })

  async function runSetVariable(
    filters: Array<{ field: string; op: string; value: unknown }>,
    triggerEntry: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const variables: Record<string, unknown> = {}
    const context = await resolveAutomationContext({} as never, triggerEntry, [triggerEntry])
    await executeSetVariable(
      { type: 'set_variable', name: 'c', seed_slug: 'sv_customers', filters } as never,
      {
        entry: triggerEntry,
        variables,
        repository,
        getSeed: (slug: string): Seed | null => (slug === 'sv_customers' ? customersSeed : null),
        seed: customersSeed,
        context,
      },
    )
    return variables.c as Record<string, unknown>
  }

  it('a number filter whose placeholder resolves empty matches no row', async () => {
    const result = await runSetVariable(
      [{ field: 'customer_no', op: 'eq', value: '{{this.customer_no}}' }],
      { id: 'trigger-1' },
    )

    expect(result.count).toBe(0)
    expect(result.lastone).toBeNull()
  })

  it('a date filter whose placeholder resolves unparsable matches no row', async () => {
    const result = await runSetVariable(
      [{ field: 'since', op: 'gt', value: 'not-a-date' }],
      { id: 'trigger-1' },
    )

    expect(result.count).toBe(0)
    expect(result.lastone).toBeNull()
  })

  it('a filter on an unknown field matches no row', async () => {
    const result = await runSetVariable(
      [{ field: 'customer_number', op: 'eq', value: '1' }],
      { id: 'trigger-1' },
    )

    expect(result.count).toBe(0)
    expect(result.lastone).toBeNull()
  })

  it('a number filter with a resolved value still matches the row it names', async () => {
    const result = await runSetVariable(
      [{ field: 'customer_no', op: 'eq', value: '{{this.customer_no}}' }],
      { id: 'trigger-1', customer_no: 2 },
    )

    expect(result.count).toBe(1)
    expect((result.lastone as Record<string, unknown>).email).toBe('bob@example.com')
  })
})
