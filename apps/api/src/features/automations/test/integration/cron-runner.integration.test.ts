// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Cron runner — integration tier. The automation is stored through the real route and the runner
 * reads it, the entries and the set_variable collection from real D1. The cron entry point has no
 * HTTP surface, so the act is the scheduled-handler call itself.
 * Batch actions (webhook, send_mail) leave the Worker; their context is covered in cron-runner.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, SystemIdGenerator, type Branch, type Seed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { D1AutomationRepository } from '../../../../shared/db/repositories/automations.repository.d1'
import { D1ContentRepository } from '../../../../shared/db/repositories/content.repository.d1'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { runCronAutomations } from '../../engine/cron-runner'

const ordersSeed = defineSeed({
  slug: 'cr_orders',
  label: 'cr_orders',
  labelPlural: 'cr_orders',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true } as Branch,
    { id: 'br_02', alias: 'note', label: 'Note', type: 'text' } as Branch,
  ],
})

// 2026-05-14T09:00:00Z; the automation below fires every minute, so any tick matches.
const TICK = new Date('2026-05-14T09:00:00Z').getTime()

describe('runCronAutomations — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let entryIds: string[]

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [ordersSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')

    entryIds = []
    for (const slug of ['cr-first', 'cr-second']) {
      const created = await admin.post('/api/content/cr_orders', { title: slug, slug })
      expect(created.status).toBe(201)
      entryIds.push((await created.json<{ id: string }>()).id)
    }
  })

  function runTick(): Promise<void> {
    return runCronAutomations(
      {
        automationRepository: new D1AutomationRepository(env.DB),
        contentRepository: new D1ContentRepository(env.DB),
        getSeed: (slug: string): Seed | null => (slug === ordersSeed.slug ? ordersSeed : null),
        env: {},
        idGenerator: SystemIdGenerator,
      },
      TICK,
    )
  }

  it('a per-entry action reads the collection a preceding set_variable stored', async () => {
    const stored = await admin.post('/api/automations', {
      seed_slug: 'cr_orders',
      name: 'count-open-orders',
      triggers: [{ event: 'cron', cron: '* * * * *' }],
      actions: [
        { type: 'set_variable', name: 'v', seed_slug: 'cr_orders' },
        { type: 'edit_field', field: 'note', value: '{{v.count}} open' },
      ],
    })
    expect(stored.status).toBe(201)

    await runTick()

    // Regression guard: the cron runner handed actions a context without the variables map,
    // so `{{v.count}}` rendered empty and every note became " open".
    for (const id of entryIds) {
      const response = await admin.get(`/api/content/cr_orders/${id}`)
      expect(response.status).toBe(200)
      const body = await response.json<{ data: { note: string | null } }>()
      expect(body.data.note).toBe('2 open')
    }
  })
})
