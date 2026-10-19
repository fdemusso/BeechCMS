// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — repeater branch definitions and sub-field id allocation (real D1).
 * Covers creating seeds with repeaters, appending repeater branches, updating seeds with repeaters,
 * and ensuring repeater sub-fields are recursively assigned valid IDs (issue #777),
 * as well as enforcing seed validation constraints on repeater branches.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import type { Seed } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('seeds slice — repeater definitions and sub-field ids (real D1)', () => {
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

  async function storedDefinition(slug: string): Promise<Seed> {
    const record = await (await admin.get(`/api/seeds/${slug}`)).json<{ definition: Seed }>()
    return record.definition
  }

  describe('POST /api/seeds — repeater sub-field id allocation (issue #777)', () => {
    it('mints ids for repeater sub-fields when omitted by the caller instead of rejecting with 422', async () => {
      const response = await admin.post('/api/seeds', {
        slug: 'testimonials',
        label: 'Testimonials',
        displayNameAlias: 'author',
        branches: [
          { alias: 'author', type: 'text', label: 'Author' },
          {
            alias: 'ratings',
            type: 'repeater',
            label: 'Ratings',
            fields: [
              { alias: 'score', type: 'number', label: 'Score' },
              { alias: 'comment', type: 'text', label: 'Comment' },
            ],
          },
        ],
      })

      expect(response.status).toBe(201)
      const body = await response.json<{ slug: string }>()
      expect(body.slug).toBe('testimonials')

      const def = await storedDefinition('testimonials')
      const repeater = def.branches.find(b => b.alias === 'ratings')
      expect(repeater?.id).toMatch(/^br_[A-Za-z0-9]+$/)
      expect(repeater?.fields?.[0]?.id).toMatch(/^br_[A-Za-z0-9]+$/)
      expect(repeater?.fields?.[1]?.id).toMatch(/^br_[A-Za-z0-9]+$/)
      expect(repeater?.fields?.[0]?.id).not.toBe(repeater?.fields?.[1]?.id)
    })
  })

  describe('POST /api/seeds/:slug/branches — repeater sub-field id allocation (issue #777)', () => {
    it('mints ids for repeater sub-fields when appending a new repeater branch to an existing seed', async () => {
      await admin.post('/api/seeds', {
        slug: 'articles',
        label: 'Articles',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', type: 'text', label: 'Title' },
        ],
      })

      const response = await admin.post('/api/seeds/articles/branches', {
        alias: 'faq',
        type: 'repeater',
        label: 'FAQ',
        fields: [
          { alias: 'question', type: 'text', label: 'Question' },
          { alias: 'answer', type: 'text', label: 'Answer' },
        ],
      })

      expect(response.status).toBe(200)
      const body = await response.json<{ id: string }>()
      expect(body.id).toMatch(/^br_[A-Za-z0-9]+$/)

      const def = await storedDefinition('articles')
      const repeater = def.branches.find(b => b.alias === 'faq')
      expect(repeater?.id).toBe(body.id)
      expect(repeater?.fields?.[0]?.id).toMatch(/^br_[A-Za-z0-9]+$/)
      expect(repeater?.fields?.[1]?.id).toMatch(/^br_[A-Za-z0-9]+$/)
    })
  })

  describe('PUT /api/seeds/:slug — repeater update and sub-field id preservation (issue #777)', () => {
    it('preserves existing sub-field ids and mints fresh ids for newly added sub-fields', async () => {
      const postRes = await admin.post('/api/seeds', {
        slug: 'pricing',
        label: 'Pricing',
        displayNameAlias: 'package_name',
        branches: [
          { id: 'br_01', alias: 'package_name', type: 'text', label: 'Package' },
          {
            id: 'br_02',
            alias: 'tiers',
            type: 'repeater',
            label: 'Tiers',
            fields: [
              { id: 'br_03', alias: 'name', type: 'text', label: 'Name' },
            ],
          },
        ],
      })
      expect(postRes.status).toBe(201)
      const stored = await storedDefinition('pricing')

      const response = await admin.put('/api/seeds/pricing', {
        ...stored,
        branches: [
          stored.branches[0],
          {
            ...stored.branches[1],
            fields: [
              { alias: 'name', type: 'text', label: 'Name' }, // omitted id, should preserve br_03
              { alias: 'price', type: 'number', label: 'Price' }, // new sub-field without id
            ],
          },
        ],
      })

      expect(response.status).toBe(200)

      const updated = await storedDefinition('pricing')
      const repeater = updated.branches.find(b => b.alias === 'tiers')
      const nameField = repeater?.fields?.find(f => f.alias === 'name')
      const priceField = repeater?.fields?.find(f => f.alias === 'price')
      expect(nameField?.id).toBe('br_03')
      expect(priceField?.id).toMatch(/^br_[A-Za-z0-9]+$/)
      expect(priceField?.id).not.toBe('br_03')
    })
  })

  describe('seed validation constraints on repeaters', () => {
    it('rejects a nested repeater sub-field with 422 Fatal 10 and creates no table', async () => {
      const response = await admin.post('/api/seeds', {
        slug: 'nested_rep',
        label: 'Nested Repeater',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', type: 'text', label: 'Title' },
          {
            alias: 'matrix',
            type: 'repeater',
            label: 'Matrix',
            fields: [
              { id: 'br_sub1', alias: 'nested', type: 'repeater', label: 'Nested', fields: [] },
            ],
          },
        ],
      })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string; detail?: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/validation-failed')

      const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_nested_rep'").first()
      expect(table).toBeNull()
    })

    it('rejects a relation sub-field with 422 Fatal 10 and creates no table', async () => {
      const response = await admin.post('/api/seeds', {
        slug: 'rel_rep',
        label: 'Relation Repeater',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', type: 'text', label: 'Title' },
          {
            alias: 'members',
            type: 'repeater',
            label: 'Members',
            fields: [
              { id: 'br_sub1', alias: 'user', type: 'relation', targetSeed: 'users', label: 'User' },
            ],
          },
        ],
      })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string; detail?: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/validation-failed')

      const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_rel_rep'").first()
      expect(table).toBeNull()
    })

    it('rejects a localized repeater sub-field with 422 Fatal 17 and creates no table', async () => {
      const response = await admin.post('/api/seeds', {
        slug: 'loc_rep',
        label: 'Localized Repeater',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', type: 'text', label: 'Title' },
          {
            alias: 'items',
            type: 'repeater',
            label: 'Items',
            fields: [
              { id: 'br_sub1', alias: 'name', type: 'text', label: 'Name', localized: true },
            ],
          },
        ],
      })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/validation-failed')

      const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_loc_rep'").first()
      expect(table).toBeNull()
    })

    it('rejects minItems greater than maxItems with 422 Fatal 11 and creates no table', async () => {
      const response = await admin.post('/api/seeds', {
        slug: 'bad_bounds',
        label: 'Bad Bounds',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', type: 'text', label: 'Title' },
          {
            id: 'br_rep',
            alias: 'items',
            type: 'repeater',
            label: 'Items',
            minItems: 5,
            maxItems: 2,
            fields: [
              { id: 'br_sub1', alias: 'text', type: 'text', label: 'Text' },
            ],
          },
        ],
      })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/validation-failed')

      const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_bad_bounds'").first()
      expect(table).toBeNull()
    })

    it('rejects negative cardinality bounds with 422 Fatal 11 and creates no table', async () => {
      const response = await admin.post('/api/seeds', {
        slug: 'negative_bounds',
        label: 'Negative Bounds',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', type: 'text', label: 'Title' },
          {
            id: 'br_rep',
            alias: 'items',
            type: 'repeater',
            label: 'Items',
            minItems: -1,
            fields: [
              { id: 'br_sub1', alias: 'text', type: 'text', label: 'Text' },
            ],
          },
        ],
      })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/validation-failed')

      const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='content_negative_bounds'").first()
      expect(table).toBeNull()
    })
  })
})
