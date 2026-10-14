// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — control-plane definition diff, integration tier.
 * Covers how mcp-plan and mcp-apply recognise changes that produce no DDL (tag options, colors, multiple).
 * Physical drift (a column missing while the definition is unchanged) is deliberately not covered here:
 * it is the job of `beech schema diff` (packages/cli/src/test/schema-diff.test.ts).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import type { Seed, TagOption } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface PlanBody {
  applicable: boolean
  definitionChanged: boolean
  changedBranches: string[]
  statements: string[]
  expectedVersion: number
}

describe('seeds slice — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  async function storedPosts(): Promise<Seed> {
    const record = await (await admin.get('/api/seeds/posts')).json<{ definition: Seed }>()
    return record.definition
  }

  function withPriority(seed: Seed, change: (branch: Seed['branches'][number]) => Seed['branches'][number]): Seed {
    return { ...seed, branches: seed.branches.map(branch => branch.alias === 'priority' ? change(branch) : branch) }
  }

  function recolorHigh(options: TagOption[] | undefined): TagOption[] {
    return (options ?? []).map(option => option.value === 'high' ? { ...option, color: '#dc2626' } : option)
  }

  async function priorityOptions(): Promise<TagOption[]> {
    const posts = await storedPosts()
    return posts.branches.find(branch => branch.alias === 'priority')?.options ?? []
  }

  describe('POST /api/seeds/:slug/mcp-plan', () => {
    it('replanning the unchanged stored definition reports definitionChanged false and no branches', async () => {
      const candidate = await storedPosts()

      const response = await admin.post('/api/seeds/posts/mcp-plan', { candidate })

      expect(response.status).toBe(200)
      const body = await response.json<PlanBody>()
      expect(body.definitionChanged).toBe(false)
      expect(body.changedBranches).toEqual([])
    })

    it('changing an option color reports priority as changed with no ADD COLUMN statement', async () => {
      const candidate = withPriority(await storedPosts(), branch => ({ ...branch, options: recolorHigh(branch.options) }))

      const response = await admin.post('/api/seeds/posts/mcp-plan', { candidate })

      expect(response.status).toBe(200)
      const body = await response.json<PlanBody>()
      expect(body.applicable).toBe(true)
      expect(body.definitionChanged).toBe(true)
      expect(body.changedBranches).toEqual(['priority'])
      expect(body.statements.some(statement => statement.includes('ADD COLUMN'))).toBe(false)
    })

    it('removing multiple false from priority reports priority as changed', async () => {
      const candidate = withPriority(await storedPosts(), ({ multiple: _multiple, ...branch }) => branch)

      const response = await admin.post('/api/seeds/posts/mcp-plan', { candidate })

      expect(response.status).toBe(200)
      const body = await response.json<PlanBody>()
      expect(body.changedBranches).toEqual(['priority'])
    })

    it('planning writes nothing: the stored option colors stay as they were', async () => {
      const original = await priorityOptions()
      const candidate = withPriority(await storedPosts(), branch => ({ ...branch, options: recolorHigh(branch.options) }))

      const response = await admin.post('/api/seeds/posts/mcp-plan', { candidate })

      expect(response.status).toBe(200)
      expect(await priorityOptions()).toEqual(original)
    })
  })

  describe('POST /api/seeds/:slug/mcp-apply', () => {
    it('applying a color change persists it and a new plan of the same candidate reports no change', async () => {
      const candidate = withPriority(await storedPosts(), branch => ({ ...branch, options: recolorHigh(branch.options) }))
      const plan = await (await admin.post('/api/seeds/posts/mcp-plan', { candidate })).json<PlanBody>()

      const response = await admin.post('/api/seeds/posts/mcp-apply', { candidate, expectedVersion: plan.expectedVersion })

      expect(response.status).toBe(200)
      const options = await priorityOptions()
      expect(options.find(option => option.value === 'high')?.color).toBe('#dc2626')
      const replan = await (await admin.post('/api/seeds/posts/mcp-plan', { candidate })).json<PlanBody>()
      expect(replan.definitionChanged).toBe(false)
    })
  })
})
