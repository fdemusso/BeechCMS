// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from './fixtures'
import { defineSeed } from '@beechcms/core'

const CATEGORY_SEED = defineSeed({
  slug: 'test_categories',
  label: 'Category',
  labelPlural: 'Categories',
  displayNameAlias: 'name',
  branches: [
    { alias: 'name', label: 'Name', type: 'text' },
  ]
})

const PRODUCT_SEED = defineSeed({
  slug: 'test_products',
  label: 'Product',
  labelPlural: 'Products',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text' },
    { alias: 'category_id', label: 'Category', type: 'relation', targetSeed: 'test_categories' }
  ]
})

const REVIEW_SEED = defineSeed({
  slug: 'test_reviews',
  label: 'Review',
  labelPlural: 'Reviews',
  displayNameAlias: 'author',
  branches: [
    { alias: 'author', label: 'Author', type: 'text', policies: { visibility: 'masked' } },
    { alias: 'product_id', label: 'Product', type: 'relation', targetSeed: 'test_products' }
  ]
})

const HIDDEN_DOC_SEED = defineSeed({
  slug: 'test_hidden_docs',
  label: 'Hidden Doc',
  labelPlural: 'Hidden Docs',
  displayNameAlias: 'internal_name',
  branches: [
    { alias: 'internal_name', label: 'Name', type: 'text', policies: { visibility: 'hidden' } },
    { alias: 'product_id', label: 'Product', type: 'relation', targetSeed: 'test_products' }
  ]
})

const DDL = `
CREATE TABLE IF NOT EXISTS content_test_categories (
  id         TEXT NOT NULL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'published',
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS content_test_products (
  id          TEXT NOT NULL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'published',
  title       TEXT NOT NULL,
  category_id TEXT REFERENCES content_test_categories(id),
  created_at  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS content_test_reviews (
  id         TEXT NOT NULL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'published',
  author     TEXT NOT NULL,
  product_id TEXT REFERENCES content_test_products(id),
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS content_test_hidden_docs (
  id            TEXT NOT NULL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'published',
  internal_name TEXT NOT NULL,
  product_id    TEXT REFERENCES content_test_products(id),
  created_at    INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL DEFAULT 0
);
`

describe('Flow: Backrefs API', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let token: string

  beforeEach(async () => {
    db = new D1TestDatabase({
      applyMigrations: true,
      seedSql: [DDL],
    })
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [CATEGORY_SEED, PRODUCT_SEED, REVIEW_SEED, HIDDEN_DOC_SEED] })
    
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const body = await res.json<{ token: string }>()
    token = body.token

    // Insert records
    await db.prepare("INSERT INTO content_test_categories (id, slug, name) VALUES ('cat-1', 'cat-1', 'Electronics')").run()
    await db.prepare("INSERT INTO content_test_products (id, slug, title, category_id) VALUES ('prod-1', 'prod-1', 'Laptop', 'cat-1')").run()
    await db.prepare("INSERT INTO content_test_products (id, slug, title, category_id) VALUES ('prod-2', 'prod-2', 'Phone', 'cat-1')").run()
    await db.prepare("INSERT INTO content_test_reviews (id, slug, author, product_id) VALUES ('rev-1', 'rev-1', 'Alice', 'prod-1')").run()
    await db.prepare("INSERT INTO content_test_reviews (id, slug, author, product_id) VALUES ('rev-2', 'rev-2', 'Bob', 'prod-1')").run()
    await db.prepare("INSERT INTO content_test_hidden_docs (id, slug, internal_name, product_id) VALUES ('doc-1', 'doc-1', 'Secret Specs', 'prod-1')").run()
  })

  it('error: 404 if target seed does not exist', async () => {
    const res = await app.request('/api/content/unknown/some-id/backrefs', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ type: 'https://beechcms.dev/problems/not-found' })
  })

  it('error: 404 if target entry does not exist', async () => {
    const res = await app.request('/api/content/test_categories/ghost-id/backrefs', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ type: 'https://beechcms.dev/problems/not-found' })
  })

  it('success: returns empty groups if no sources point to it', async () => {
    const res = await app.request('/api/content/test_reviews/rev-1/backrefs', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ groups: [] })
  })

  it('success: returns preview groups correctly', async () => {
    const res = await app.request('/api/content/test_categories/cat-1/backrefs', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(200)
    const data = await res.json<{ groups: any[] }>()
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0].sourceSlug).toBe('test_products')
    expect(data.groups[0].total).toBe(2)
    expect(data.groups[0].items).toHaveLength(2)
  })

  it('success: paginated single-group request', async () => {
    const res = await app.request('/api/content/test_products/prod-1/backrefs?group=test_reviews:product_id&limit=1&page=2', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(200)
    const data = await res.json<{ groups: any[] }>()
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0].total).toBe(2)
    expect(data.groups[0].items).toHaveLength(1) // due to limit=1
  })

  it('error: paginated single-group request with invalid group param', async () => {
    const res = await app.request('/api/content/test_products/prod-1/backrefs?group=invalidformat', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(400)
  })

  it('error: paginated single-group request with unknown group', async () => {
    const res = await app.request('/api/content/test_products/prod-1/backrefs?group=ghost:product_id', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    expect(res.status).toBe(404)
  })

  it('success: filters visibility (masked)', async () => {
    const res = await app.request('/api/content/test_products/prod-1/backrefs', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    
    expect(res.status).toBe(200)
    const data = await res.json<{ groups: any[] }>()
    
    const reviewsGroup = data.groups.find(g => g.sourceSlug === 'test_reviews')
    expect(reviewsGroup).toBeDefined()
    expect(reviewsGroup.items[0].displayName).toBe('••••••••') // Author field is masked
  })

  it('success: filters visibility (hidden)', async () => {
    const res = await app.request('/api/content/test_products/prod-1/backrefs', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, { ...TEST_ENV, DB: db })
    
    expect(res.status).toBe(200)
    const data = await res.json<{ groups: any[] }>()
    
    const docsGroup = data.groups.find(g => g.sourceSlug === 'test_hidden_docs')
    expect(docsGroup).toBeDefined()
    expect(docsGroup.items[0].displayName).toBeNull() // internal_name is hidden
  })
})
