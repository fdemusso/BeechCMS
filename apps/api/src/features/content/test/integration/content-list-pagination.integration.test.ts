// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — list pagination order, integration tier. Entries sharing one sort key (bulk imports
 * write identical `created_at`; `status` and boolean fields tie almost every row) must page in a total
 * order, otherwise `LIMIT/OFFSET` across `?page=N` can repeat or skip entries.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const tasksSeed = defineSeed({
  slug: 'pg_list_tasks',
  label: 'Tasks',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'done', label: 'Done', type: 'boolean' },
  ],
})

const TIED_CREATED_AT = 1_700_000_000
const ENTRY_COUNT = 7
const PAGE_SIZE = 3
const PAGE_COUNT = Math.ceil(ENTRY_COUNT / PAGE_SIZE)

describe('content slice — list pagination order (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let createdIds: string[]

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [tasksSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')

    createdIds = []
    for (let i = 0; i < ENTRY_COUNT; i++) {
      const response = await admin.post('/api/content/pg_list_tasks', { title: `Task ${i}`, status: 'published' })
      expect(response.status).toBe(201) // precondition
      createdIds.push((await response.json<{ id: string }>()).id)
    }
    await harness.db.prepare('UPDATE content_pg_list_tasks SET created_at = ?').bind(TIED_CREATED_AT).run()
  })

  async function pagedIds(query: string): Promise<string[]> {
    const ids: string[] = []
    for (let page = 1; page <= PAGE_COUNT; page++) {
      const response = await admin.get(`/api/content/pg_list_tasks?${query}&page=${page}&limit=${PAGE_SIZE}`)
      expect(response.status).toBe(200)
      ids.push(...(await response.json<{ items: { id: string }[] }>()).items.map((item) => item.id))
    }
    return ids
  }

  it('pages the default order (equal created_at) newest-first with id as the final key', async () => {
    const paged = await pagedIds('')

    expect(paged).toEqual([...createdIds].sort().reverse())
  })

  it('pages an ascending sort on a tied column (status) in ascending id order', async () => {
    const paged = await pagedIds('sortBy=status&sortDir=asc')

    expect(paged).toEqual([...createdIds].sort())
  })

  it('pages a descending sort on a tied column (status) in descending id order', async () => {
    const paged = await pagedIds('sortBy=status&sortDir=desc')

    expect(paged).toEqual([...createdIds].sort().reverse())
  })

  it('pages a kanban list with no stored positions in ascending id order', async () => {
    const paged = await pagedIds('kanbanAxis=br_02')

    expect(paged).toEqual([...createdIds].sort())
  })
})
