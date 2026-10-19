// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — repeater fields integration tier (real D1).
 * Covers complete CRUD lifecycle, drafts mirror, bulk updates, export constraints,
 * and edge cases (cardinality bounds, required sub-fields value-level emptiness,
 * stripping unknown keys, malformed payloads).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const faqSeed = defineSeed({
  slug: 'faq_articles',
  label: 'FAQ Articles',
  displayNameAlias: 'topic',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'topic', label: 'Topic', type: 'text', requiredOnCreate: true },
    {
      id: 'br_02',
      alias: 'questions',
      label: 'Questions',
      type: 'repeater',
      minItems: 1,
      maxItems: 5,
      fields: [
        { id: 'br_03', alias: 'q', label: 'Question', type: 'text', requiredOnCreate: true },
        { id: 'br_04', alias: 'a', label: 'Answer', type: 'text', requiredOnCreate: true },
        { id: 'br_05', alias: 'order', label: 'Order', type: 'number' },
        { id: 'br_06', alias: 'verified', label: 'Verified', type: 'boolean' },
      ],
    },
  ],
})

const profileSeed = defineSeed({
  slug: 'user_profiles',
  label: 'User Profiles',
  displayNameAlias: 'username',
  allowDrafts: true,
  branches: [
    { id: 'br_p1', alias: 'username', label: 'Username', type: 'text', requiredOnCreate: true },
    {
      id: 'br_p2',
      alias: 'socials',
      label: 'Socials',
      type: 'repeater',
      allowNull: true,
      fields: [
        { id: 'br_p3', alias: 'platform', label: 'Platform', type: 'text', requiredOnCreate: true },
        { id: 'br_p4', alias: 'url', label: 'URL', type: 'text', requiredOnCreate: true },
      ],
    },
  ],
})

const recipeSeed = defineSeed({
  slug: 'recipe_items',
  label: 'Recipe Items',
  displayNameAlias: 'name',
  allowDrafts: true,
  branches: [
    { id: 'br_r1', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
    {
      id: 'br_r2',
      alias: 'ingredients',
      label: 'Ingredients',
      type: 'repeater',
      requiredOnCreate: true,
      fields: [
        { id: 'br_r3', alias: 'item', label: 'Item', type: 'text', requiredOnCreate: true },
        { id: 'br_r4', alias: 'qty', label: 'Quantity', type: 'number', requiredOnCreate: true },
      ],
    },
  ],
})

describe('content slice — repeater fields (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [faqSeed, profileSeed, recipeSeed],
      env: { MEDIA_BUCKET: (env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  describe('CRUD lifecycle', () => {
    it('creates an entry with repeater items and persists serialized JSON in D1', async () => {
      const response = await admin.post('/api/content/faq_articles', {
        topic: 'Billing',
        questions: [
          { q: 'How to pay?', a: 'Via Credit Card', order: 1, verified: true },
          { q: 'Can I get a refund?', a: 'Yes within 30 days', order: 2, verified: false },
        ],
      })

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()
      expect(id).toMatch(UUID_V4_PATTERN)

      const row = await env.DB.prepare('SELECT questions FROM content_faq_articles WHERE id = ?').bind(id)
        .first<{ questions: string }>()
      expect(row).not.toBeNull()
      const parsed = JSON.parse(row!.questions)
      expect(parsed).toHaveLength(2)
      expect(parsed[0]).toEqual({ q: 'How to pay?', a: 'Via Credit Card', order: 1, verified: true })
      expect(parsed[1]).toEqual({ q: 'Can I get a refund?', a: 'Yes within 30 days', order: 2, verified: false })
    })

    it('reads back the entry with deserialized repeater array', async () => {
      const created = await admin.post('/api/content/faq_articles', {
        topic: 'Shipping',
        questions: [{ q: 'Where do you ship?', a: 'Worldwide', order: 1, verified: true }],
      })
      const { id } = await created.json<{ id: string }>()

      const response = await admin.get(`/api/content/faq_articles/${id}`)

      expect(response.status).toBe(200)
      const body = await response.json<{ id: string; data: { topic: string; questions: Array<{ q: string; a: string }> } }>()
      expect(body.id).toBe(id)
      expect(body.data.topic).toBe('Shipping')
      expect(body.data.questions).toEqual([{ q: 'Where do you ship?', a: 'Worldwide', order: 1, verified: true }])
    })

    it('updates an entry replacing all repeater items', async () => {
      const created = await admin.post('/api/content/faq_articles', {
        topic: 'Security',
        questions: [{ q: 'Is it safe?', a: 'Yes', order: 1, verified: true }],
      })
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/faq_articles/${id}`, {
        topic: 'Security V2',
        questions: [
          { q: 'Is MFA supported?', a: 'Yes, TOTP', order: 10, verified: true },
          { q: 'Is data encrypted?', a: 'Yes, AES-256', order: 20, verified: true },
        ],
      })

      expect(response.status).toBe(200)

      const row = await env.DB.prepare('SELECT questions FROM content_faq_articles WHERE id = ?').bind(id)
        .first<{ questions: string }>()
      const parsed = JSON.parse(row!.questions)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].q).toBe('Is MFA supported?')
      expect(parsed[1].q).toBe('Is data encrypted?')
    })

    it('updates only the scalar topic field on PUT while resending existing repeater items', async () => {
      const created = await admin.post('/api/content/faq_articles', {
        topic: 'Original Topic',
        questions: [{ q: 'Original Q?', a: 'Original A', order: 1 }],
      })
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/faq_articles/${id}`, {
        topic: 'Updated Topic Only',
        questions: [{ q: 'Original Q?', a: 'Original A', order: 1 }],
      })

      expect(response.status).toBe(200)

      const row = await env.DB.prepare('SELECT topic, questions FROM content_faq_articles WHERE id = ?').bind(id)
        .first<{ topic: string; questions: string }>()
      expect(row?.topic).toBe('Updated Topic Only')
      const parsed = JSON.parse(row!.questions)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].q).toBe('Original Q?')
    })

    it('deletes an entry containing repeater items', async () => {
      const created = await admin.post('/api/content/faq_articles', {
        topic: 'To Delete',
        questions: [{ q: 'Will I be deleted?', a: 'Yes' }],
      })
      const { id } = await created.json<{ id: string }>()

      const response = await admin.delete(`/api/content/faq_articles/${id}`)

      expect(response.status).toBe(200)

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_faq_articles WHERE id = ?').bind(id)
        .first<{ n: number }>()
      expect(count?.n).toBe(0)
    })
  })

  describe('optional and empty repeater handling', () => {
    it('stores and deserializes empty array when optional repeater is sent as []', async () => {
      const response = await admin.post('/api/content/user_profiles', {
        username: 'alice',
        socials: [],
      })

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()

      const getRes = await admin.get(`/api/content/user_profiles/${id}`)
      const body = await getRes.json<{ data: { socials: unknown[] } }>()
      expect(body.data.socials).toEqual([])
    })

    it('deserializes to empty array when optional repeater is omitted from payload', async () => {
      const response = await admin.post('/api/content/user_profiles', {
        username: 'bob',
      })

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()

      const getRes = await admin.get(`/api/content/user_profiles/${id}`)
      const body = await getRes.json<{ data: { socials: unknown[] } }>()
      expect(body.data.socials).toEqual([])
    })

    it('rejects null for optional repeater on POST when allowNull is false', async () => {
      const response = await admin.post('/api/content/user_profiles', {
        username: 'charlie_null',
        socials: null,
      })

      expect(response.status).toBe(400)
    })

    it('deserializes to empty array when optional repeater is cleared via null on PUT', async () => {
      const createRes = await admin.post('/api/content/user_profiles', {
        username: 'charlie_put',
        socials: [{ platform: 'x', url: 'https://x.com/charlie' }],
      })
      expect(createRes.status).toBe(201)
      const { id } = await createRes.json<{ id: string }>()

      const putRes = await admin.put(`/api/content/user_profiles/${id}`, {
        username: 'charlie_put',
        socials: null,
      })
      expect(putRes.status).toBe(200)

      const getRes = await admin.get(`/api/content/user_profiles/${id}`)
      const body = await getRes.json<{ data: { socials: unknown[] } }>()
      expect(body.data.socials).toEqual([])
    })
  })

  describe('cardinality bounds (minItems / maxItems)', () => {
    it('rejects an array with fewer items than minItems with 400 validation-failed', async () => {
      const response = await admin.post('/api/content/faq_articles', {
        topic: 'Too few',
        questions: [], // minItems is 1
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string; errors?: Array<{ field: string; message: string }> }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_faq_articles').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })

    it('rejects an array with more items than maxItems with 400 validation-failed', async () => {
      const response = await admin.post('/api/content/faq_articles', {
        topic: 'Too many',
        questions: [
          { q: 'Q1', a: 'A1' },
          { q: 'Q2', a: 'A2' },
          { q: 'Q3', a: 'A3' },
          { q: 'Q4', a: 'A4' },
          { q: 'Q5', a: 'A5' },
          { q: 'Q6', a: 'A6' }, // maxItems is 5
        ],
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_faq_articles').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })
  })

  describe('required repeater constraint', () => {
    it('rejects an empty array when repeater is requiredOnCreate', async () => {
      const response = await admin.post('/api/content/recipe_items', {
        name: 'Empty Recipe',
        ingredients: [],
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_recipe_items').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })

    it('rejects omitted repeater when repeater is requiredOnCreate', async () => {
      const response = await admin.post('/api/content/recipe_items', {
        name: 'Omitted Ingredients',
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_recipe_items').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })
  })

  describe('required sub-fields value-level emptiness (issue #444)', () => {
    it('rejects whitespace-only text on required repeater sub-field', async () => {
      const response = await admin.post('/api/content/recipe_items', {
        name: 'Pancake',
        ingredients: [{ item: '   ', qty: 100 }],
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_recipe_items').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })

    it('rejects empty string on required number repeater sub-field', async () => {
      const response = await admin.post('/api/content/recipe_items', {
        name: 'Pancake',
        ingredients: [{ item: 'Flour', qty: '' }],
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_recipe_items').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })

    it('rejects missing key for required non-text sub-field', async () => {
      const response = await admin.post('/api/content/recipe_items', {
        name: 'Pancake',
        ingredients: [{ item: 'Flour' }], // missing required qty
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_recipe_items').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })
  })

  describe('sanitization and defense', () => {
    it('strips unknown property keys from repeater items on save', async () => {
      const response = await admin.post('/api/content/faq_articles', {
        topic: 'Sanitization',
        questions: [
          { q: 'Clean question?', a: 'Clean answer', order: 1, unauthorizedKey: 'payload_leak', __proto_hack: true },
        ],
      })

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()

      const row = await env.DB.prepare('SELECT questions FROM content_faq_articles WHERE id = ?').bind(id)
        .first<{ questions: string }>()
      const parsed = JSON.parse(row!.questions)
      expect(parsed[0]).toEqual({ q: 'Clean question?', a: 'Clean answer', order: 1 })
      expect(parsed[0].unauthorizedKey).toBeUndefined()
      expect(parsed[0].__proto_hack).toBeUndefined()
    })

    it('rejects a scalar string passed to a repeater branch with 400 validation-failed', async () => {
      const response = await admin.post('/api/content/faq_articles', {
        topic: 'Malformed',
        questions: 'not an array',
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_faq_articles').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })

    it('rejects an object passed to a repeater branch with 400 validation-failed', async () => {
      const response = await admin.post('/api/content/faq_articles', {
        topic: 'Malformed Object',
        questions: { q: 'I should be in an array' },
      })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('content-validation-failed')

      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM content_faq_articles').first<{ n: number }>()
      expect(count?.n).toBe(0)
    })
  })

  describe('drafts mirror lifecycle', () => {
    it('creates a draft for an entry with repeater items without mutating the live table', async () => {
      const created = await admin.post('/api/content/faq_articles', {
        topic: 'Live Article',
        questions: [{ q: 'Live Q?', a: 'Live A' }],
      })
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/faq_articles/${id}/draft`, {
        questions: [{ q: 'Draft Q?', a: 'Draft A' }],
      })

      expect(response.status).toBe(200)

      const draftRow = await env.DB.prepare('SELECT questions FROM content_faq_articles_drafts WHERE entry_id = ?').bind(id)
        .first<{ questions: string }>()
      expect(draftRow).not.toBeNull()
      expect(JSON.parse(draftRow!.questions)[0].q).toBe('Draft Q?')

      const liveRow = await env.DB.prepare('SELECT questions FROM content_faq_articles WHERE id = ?').bind(id)
        .first<{ questions: string }>()
      expect(JSON.parse(liveRow!.questions)[0].q).toBe('Live Q?')
    })

    it('publishes a draft copying repeater data to the live table atomically', async () => {
      const created = await admin.post('/api/content/faq_articles', {
        topic: 'To Publish',
        questions: [{ q: 'Old Q?', a: 'Old A' }],
      })
      const { id } = await created.json<{ id: string }>()
      await admin.put(`/api/content/faq_articles/${id}/draft`, {
        questions: [{ q: 'New Q?', a: 'New A' }],
      })

      const response = await admin.post(`/api/content/faq_articles/${id}/draft/publish`, {})

      expect(response.status).toBe(200)

      const liveRow = await env.DB.prepare('SELECT questions FROM content_faq_articles WHERE id = ?').bind(id)
        .first<{ questions: string }>()
      expect(liveRow).not.toBeNull()
      expect(JSON.parse(liveRow!.questions)[0].q).toBe('New Q?')

      const draftRow = await env.DB.prepare('SELECT entry_id FROM content_faq_articles_drafts WHERE entry_id = ?').bind(id).first()
      expect(draftRow).toBeNull()
    })
  })

  describe('bulk update operations', () => {
    it('updates repeater field across multiple entries simultaneously', async () => {
      const c1 = await admin.post('/api/content/user_profiles', { username: 'u1' })
      const { id: id1 } = await c1.json<{ id: string }>()
      const c2 = await admin.post('/api/content/user_profiles', { username: 'u2' })
      const { id: id2 } = await c2.json<{ id: string }>()

      const response = await admin.patch('/api/content/user_profiles/bulk', {
        ids: [id1, id2],
        fields: {
          socials: [{ platform: 'Mastodon', url: 'https://mastodon.social/@beech' }],
        },
      })

      expect(response.status).toBe(200)
      const body = await response.json<{ updated: number; failed: unknown[] }>()
      expect(body.updated).toBe(2)
      expect(body.failed).toHaveLength(0)

      const row1 = await env.DB.prepare('SELECT socials FROM content_user_profiles WHERE id = ?').bind(id1).first<{ socials: string }>()
      const row2 = await env.DB.prepare('SELECT socials FROM content_user_profiles WHERE id = ?').bind(id2).first<{ socials: string }>()
      expect(JSON.parse(row1!.socials)[0].platform).toBe('Mastodon')
      expect(JSON.parse(row2!.socials)[0].platform).toBe('Mastodon')
    })
  })

  describe('export constraints', () => {
    it('rejects CSV export for seeds containing repeater branches with 400', async () => {
      const response = await admin.get('/api/content/faq_articles/export?format=csv')

      expect(response.status).toBe(400)
      const body = await response.json<{ detail: string }>()
      expect(body.detail).toBe('CSV cannot represent relation, repeater, tags or json fields — request format=ndjson')
    })

    it('streams NDJSON export containing deserialized repeater arrays', async () => {
      await admin.post('/api/content/faq_articles', {
        topic: 'Export FAQ',
        questions: [{ q: 'Export Q?', a: 'Export A' }],
      })

      const response = await admin.get('/api/content/faq_articles/export?format=ndjson')

      expect(response.status).toBe(200)
      const text = await response.text()
      const lines = text.trim().split('\n').filter(Boolean)
      expect(lines.length).toBeGreaterThan(0)
      const last = JSON.parse(lines.at(-1)!)
      expect(last.topic).toBe('Export FAQ')
      expect(last.questions).toEqual([{ q: 'Export Q?', a: 'Export A' }])
    })
  })

  describe('filtering on repeater branches (is_empty / is_not_empty)', () => {
    it('filters entries with is_empty and is_not_empty on repeater field correctly against live D1', async () => {
      // 1. Create an entry with empty repeater ([])
      const res1 = await admin.post('/api/content/user_profiles', {
        username: 'filter_empty_user',
        socials: [],
      })
      expect(res1.status).toBe(201)
      const { id: idEmpty } = await res1.json<{ id: string }>()

      // 2. Create an entry with populated repeater
      const res2 = await admin.post('/api/content/user_profiles', {
        username: 'filter_populated_user',
        socials: [{ platform: 'github', url: 'https://github.com/octocat' }],
      })
      expect(res2.status).toBe(201)
      const { id: idPopulated } = await res2.json<{ id: string }>()

      // 3. Query with filter is_empty
      const emptyFilter = encodeURIComponent(JSON.stringify({
        socials: {
          columnId: 'socials',
          type: 'repeater',
          conditions: [{ op: 'is_empty', value: null }],
        },
      }))
      const listEmptyRes = await admin.get(`/api/content/user_profiles?filters=${emptyFilter}`)
      expect(listEmptyRes.status).toBe(200)
      const bodyEmpty = await listEmptyRes.json<{ items: Array<{ id: string; data: { socials: unknown[] } }> }>()
      const emptyIds = bodyEmpty.items.map(item => item.id)
      expect(emptyIds).toContain(idEmpty)
      expect(emptyIds).not.toContain(idPopulated)

      // 4. Query with filter is_not_empty
      const notEmptyFilter = encodeURIComponent(JSON.stringify({
        socials: {
          columnId: 'socials',
          type: 'repeater',
          conditions: [{ op: 'is_not_empty', value: null }],
        },
      }))
      const listNotEmptyRes = await admin.get(`/api/content/user_profiles?filters=${notEmptyFilter}`)
      expect(listNotEmptyRes.status).toBe(200)
      const bodyNotEmpty = await listNotEmptyRes.json<{ items: Array<{ id: string; data: { socials: unknown[] } }> }>()
      const notEmptyIds = bodyNotEmpty.items.map(item => item.id)
      expect(notEmptyIds).toContain(idPopulated)
      expect(notEmptyIds).not.toContain(idEmpty)
    })
  })
})
