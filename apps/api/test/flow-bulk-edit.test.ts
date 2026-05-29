// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from './fixtures'
import { defineSeed } from '@beechcms/core'

const BULK_TEST_SEEDS = [
  defineSeed({
    slug: 'bulk_items',
    label: 'Bulk Item',
    labelPlural: 'Bulk Items',
    displayNameAlias: 'title',
    branches: [
      { alias: 'title', label: 'Title', type: 'text', policies: { public: true } },
      { alias: 'category', label: 'Category', type: 'text' },
      { alias: 'hidden_field', label: 'Hidden', type: 'text', policies: { visibility: 'hidden' } },
      { alias: 'encrypted_field', label: 'Encrypted', type: 'text', policies: { privacy: 'encrypt' } },
      { alias: 'related_ids', label: 'Related', type: 'relation', multiple: true, target: 'bulk_items' }
    ],
  }),
]

describe('Flow: Bulk Edit Management', () => {
  let repo: StaticContentRepository
  let idempotencyRepo: StaticIdempotencyRepository
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let adminToken: string

  beforeEach(async () => {
    repo = new StaticContentRepository(BULK_TEST_SEEDS)
    idempotencyRepo = new StaticIdempotencyRepository()
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: BULK_TEST_SEEDS, repository: repo, idempotencyRepository: idempotencyRepo })

    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' })
    }, { ...TEST_ENV, DB: db })

    const loginBody = await loginRes.json<{ token: string }>()
    adminToken = loginBody.token
  })

  describe('PATCH /api/content/:slug/bulk', () => {
    it('error: validation fails for invalid ids', async () => {
      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: 'not-an-array', fields: { title: 'New Title' } })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ type: 'https://beechcms.dev/problems/bulk-invalid-ids' })
    })

    it('error: handles size limit exceeded', async () => {
      const ids = Array.from({ length: 501 }, (_, i) => `id_${i}`)
      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, fields: { title: 'New Title' } })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ type: 'https://beechcms.dev/problems/bulk-size-exceeded' })
    })

    it('error: validation fails for invalid fields payload', async () => {
      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1'], fields: [] }) // invalid fields
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ type: 'https://beechcms.dev/problems/bulk-invalid-fields' })
    })

    it('error: validation fails for unknown field', async () => {
      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1'], fields: { ghost_field: 'value' } })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ type: 'https://beechcms.dev/problems/bulk-unknown-field' })
    })

    it('error: validation fails for uneditable field (hidden or encrypted)', async () => {
      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1'], fields: { hidden_field: 'value' } })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ type: 'https://beechcms.dev/problems/field-not-bulk-editable' })
    })

    it('error: multi-relation field requires specific object structure or string array', async () => {
      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1'], fields: { related_ids: { mode: 'invalid', value: 'not-array' } } })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ type: 'https://beechcms.dev/problems/bulk-invalid-field-value' })
    })

    it('success: performs bulk update on scalar fields and logs activity', async () => {
      repo.load('bulk_items', [
        { id: 'item1', slug: 'item1', status: 'published', title: 'Old 1', category: 'cat1' },
        { id: 'item2', slug: 'item2', status: 'published', title: 'Old 2', category: 'cat1' }
      ])

      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1', 'item2'], fields: { category: 'cat2' } })
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const data = await res.json<{ updated: number, failed: any[] }>()
      expect(data.updated).toBe(2)
      expect(data.failed).toHaveLength(0)

      const item1 = await repo.findById(BULK_TEST_SEEDS[0], 'item1')
      const item2 = await repo.findById(BULK_TEST_SEEDS[0], 'item2')
      expect(item1.category).toBe('cat2')
      expect(item2.category).toBe('cat2')

      const logCount = await db.prepare("SELECT COUNT(*) as count FROM activity_logs WHERE action = 'bulk_update'").first<{ count: number }>()
      expect(logCount?.count).toBe(1)
    })

    it('success: handles multi-relation array replace', async () => {
      repo.load('bulk_items', [
        { id: 'item1', slug: 'item1', status: 'published', title: 'Title 1', related_ids: ['rel1', 'rel2'] }
      ])

      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1'], fields: { related_ids: ['rel3'] } }) // passing array directly means replace
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const item = await repo.findById(BULK_TEST_SEEDS[0], 'item1')
      expect(item.related_ids).toEqual(['rel3'])
    })

    it('success: handles multi-relation add and remove modes', async () => {
      repo.load('bulk_items', [
        { id: 'item1', slug: 'item1', status: 'published', title: 'Title 1', related_ids: ['rel1', 'rel2'] },
        { id: 'item2', slug: 'item2', status: 'published', title: 'Title 2', related_ids: ['rel2', 'rel3'] }
      ])

      // Test add
      const addRes = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1', 'item2'], fields: { related_ids: { mode: 'add', value: ['rel4'] } } })
      }, { ...TEST_ENV, DB: db })
      expect(addRes.status).toBe(200)
      
      let item1 = await repo.findById(BULK_TEST_SEEDS[0], 'item1')
      expect(item1.related_ids).toContain('rel4')
      expect(item1.related_ids).toContain('rel1')

      // Test remove
      const removeRes = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1', 'item2'], fields: { related_ids: { mode: 'remove', value: ['rel2'] } } })
      }, { ...TEST_ENV, DB: db })
      expect(removeRes.status).toBe(200)

      item1 = await repo.findById(BULK_TEST_SEEDS[0], 'item1')
      const item2 = await repo.findById(BULK_TEST_SEEDS[0], 'item2')
      expect(item1.related_ids).not.toContain('rel2')
      expect(item2.related_ids).not.toContain('rel2')
    })

    it('success: returns partial failures if some IDs are not found', async () => {
      repo.load('bulk_items', [
        { id: 'item1', slug: 'item1', status: 'published', title: 'Old 1', category: 'cat1' }
      ])

      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1', 'ghost-item'], fields: { category: 'cat2' } })
      }, { ...TEST_ENV, DB: db })

      expect(res.status).toBe(200)
      const data = await res.json<{ updated: number, failed: any[] }>()
      expect(data.updated).toBe(1)
      expect(data.failed).toHaveLength(1)
      expect(data.failed[0].id).toBe('ghost-item')
      expect(data.failed[0].problem.type).toBe('content-not-found')
    })

    it('error: returns 404 if seed does not exist', async () => {
      const res = await app.request('/api/content/unknown_seed/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['item1'], fields: { category: 'cat2' } })
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(404)
    })
    
    it('error: invalid json payload returns 400', async () => {
      const res = await app.request('/api/content/bulk_items/bulk', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: '{"invalid"'
      }, { ...TEST_ENV, DB: db })
      expect(res.status).toBe(400)
    })
  })
})
