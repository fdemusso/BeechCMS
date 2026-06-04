// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * SPRINT 2: Relation field type — end-to-end integration test
 *
 * Verifies:
 * 1. POST /api/content/articoli with a valid author_id → 201 persisted
 * 2. POST /api/content/articoli with a non-existent author_id → 422 relation-target-not-found
 * 3. DELETE /api/content/team/:id with SET NULL → 200, article.author_id becomes NULL
 * 4. DELETE /api/content/team/:id with RESTRICT → 409 relation-in-use
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from './fixtures'
import { defineSeed } from '@beechcms/core'

// ── Schema under test ────────────────────────────────────────────────────────

const TEAM_SEED = defineSeed({
  slug: 'team',
  label: 'Team Member',
  labelPlural: 'Team Members',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'email', label: 'Email', type: 'text' },
  ],
})

const ARTICLES_SEED_SET_NULL = defineSeed({
  slug: 'articoli',
  label: 'Articolo',
  labelPlural: 'Articoli',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    {
      id: 'br_02',
      alias: 'author_id',
      label: 'Author',
      type: 'relation',
      targetSeed: 'team',
      onDelete: 'SET NULL',
      policies: { search: false, filter: true, sort: false, public: true },
    },
  ],
})

const ARTICLES_SEED_RESTRICT = defineSeed({
  slug: 'articoli',
  label: 'Articolo',
  labelPlural: 'Articoli',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    {
      id: 'br_02',
      alias: 'author_id',
      label: 'Author',
      type: 'relation',
      targetSeed: 'team',
      onDelete: 'RESTRICT',
      policies: { search: false, filter: true, sort: false, public: true },
    },
  ],
})

// ── DDL helpers ──────────────────────────────────────────────────────────────

const DDL_TEAM = `
CREATE TABLE IF NOT EXISTS content_team (
  id         TEXT NOT NULL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  name       TEXT NOT NULL,
  email      TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`

const DDL_ARTICOLI_SET_NULL = `
CREATE TABLE IF NOT EXISTS content_articoli (
  id         TEXT NOT NULL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  title      TEXT NOT NULL,
  author_id  TEXT REFERENCES content_team(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`

const DDL_ARTICOLI_RESTRICT = `
CREATE TABLE IF NOT EXISTS content_articoli (
  id         TEXT NOT NULL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  title      TEXT NOT NULL,
  author_id  TEXT REFERENCES content_team(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`

// ── Stable UUID fixtures ─────────────────────────────────────────────────────
// Must pass SystemIdGenerator.isValid (UUID v4 shape)

const TEAM_ID   = '11111111-1111-4111-8111-111111111111'
const TEAM_ID_2 = '22222222-2222-4222-8222-222222222222'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase) {
  const res = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
  }, { ...TEST_ENV, DB: db })
  const body = await res.json<{ token: string }>()
  return body.token
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Flow: Relations — SET NULL', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let token: string

  beforeEach(async () => {
    db = new D1TestDatabase({
      applyMigrations: true,
      seedSql: [DDL_TEAM, DDL_ARTICOLI_SET_NULL],
    })
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [TEAM_SEED, ARTICLES_SEED_SET_NULL] })
    token = await login(app, db)
  })

  it('1. POST articoli with valid author_id → 201, row persisted', async () => {
    // Insert team member directly
    await db.prepare(
      `INSERT INTO content_team (id, slug, status, name) VALUES (?, ?, 'published', ?)`
    ).bind(TEAM_ID, 'member-1', 'Alice').run()

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: 'Test Article', author_id: TEAM_ID }),
    }, { ...TEST_ENV, DB: db })

    expect(res.status).toBe(201)
    const body = await res.json<{ id: string }>()
    expect(body.id).toBeDefined()

    // Verify persisted
    const row = await db.prepare('SELECT author_id FROM content_articoli WHERE id = ?')
      .bind(body.id).first<{ author_id: string }>()
    expect(row?.author_id).toBe(TEAM_ID)
  })

  it('2. POST articoli with non-existent author_id → 422 relation-target-not-found', async () => {
    const missingId = '99999999-9999-4999-8999-999999999999'
    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: 'Broken Article', author_id: missingId }),
    }, { ...TEST_ENV, DB: db })

    expect(res.status).toBe(422)
    const body = await res.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/relation-target-not-found')
  })

  it('3. DELETE team member with SET NULL → 200, article.author_id becomes null', async () => {
    // Setup: team + article
    await db.prepare(
      `INSERT INTO content_team (id, slug, status, name) VALUES (?, ?, 'published', ?)`
    ).bind(TEAM_ID, 'member-del', 'Bob').run()
    await db.prepare(
      `INSERT INTO content_articoli (id, slug, status, title, author_id) VALUES (?, ?, 'draft', ?, ?)`
    ).bind('art-0001-0000-4000-8000-000000000001', 'article-bob', 'Article about Bob', TEAM_ID).run()

    const delRes = await app.request(`/api/content/team/${TEAM_ID}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })

    expect(delRes.status).toBe(200)

    // author_id should be nulled out
    const row = await db.prepare('SELECT author_id FROM content_articoli WHERE id = ?')
      .bind('art-0001-0000-4000-8000-000000000001').first<{ author_id: string | null }>()
    expect(row?.author_id).toBeNull()
  })
})

describe('Flow: Relations — RESTRICT', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let token: string

  beforeEach(async () => {
    db = new D1TestDatabase({
      applyMigrations: true,
      seedSql: [DDL_TEAM, DDL_ARTICOLI_RESTRICT],
    })
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [TEAM_SEED, ARTICLES_SEED_RESTRICT] })
    token = await login(app, db)
  })

  it('4. DELETE team member with RESTRICT while referenced → 409 relation-in-use', async () => {
    await db.prepare(
      `INSERT INTO content_team (id, slug, status, name) VALUES (?, ?, 'published', ?)`
    ).bind(TEAM_ID_2, 'member-restrict', 'Carol').run()
    await db.prepare(
      `INSERT INTO content_articoli (id, slug, status, title, author_id) VALUES (?, ?, 'draft', ?, ?)`
    ).bind('art-0002-0000-4000-8000-000000000002', 'article-carol', 'Article about Carol', TEAM_ID_2).run()

    const delRes = await app.request(`/api/content/team/${TEAM_ID_2}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })

    expect(delRes.status).toBe(409)
    const body = await delRes.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/relation-in-use')
  })
})
