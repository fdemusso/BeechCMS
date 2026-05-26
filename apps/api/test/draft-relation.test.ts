// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * SPRINT 3: Draft promotion hardened against missing FK targets.
 *
 * Verifies:
 * 1. Publish draft with deleted relation target → 422 relation-target-not-found
 *    (draft table has no FK on branch columns, so save succeeds but promote fails)
 * 2. Publish draft with null author_id → 200 (null allowed)
 * 3. Publish draft with valid author_id still in target table → 200
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from './fixtures'
import { defineSeed } from '@beechcms/core'

// ── Schema ───────────────────────────────────────────────────────────────────

const TEAM_SEED = defineSeed({
  slug: 'dr_team',
  label: 'Team',
  displayNameAlias: 'name',
  branches: [
    { alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
  ],
})

const ARTICLES_SEED = defineSeed({
  slug: 'dr_articles',
  label: 'Article',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    {
      alias: 'author_id',
      label: 'Author',
      type: 'relation',
      targetSeed: 'dr_team',
      onDelete: 'SET NULL',
    },
  ],
})

// ── DDL ──────────────────────────────────────────────────────────────────────

const DDL_TEAM = `
CREATE TABLE IF NOT EXISTS content_dr_team (
  id         TEXT NOT NULL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`

const DDL_ARTICLES = `
CREATE TABLE IF NOT EXISTS content_dr_articles (
  id         TEXT NOT NULL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  title      TEXT NOT NULL,
  author_id  TEXT REFERENCES content_dr_team(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`

const DDL_ARTICLES_DRAFT = `
CREATE TABLE IF NOT EXISTS content_dr_articles_drafts (
  entry_id   TEXT NOT NULL PRIMARY KEY
             REFERENCES content_dr_articles(id) ON DELETE CASCADE,
  title      TEXT,
  author_id  TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`

// ── Stable IDs (UUID v4 shape) ────────────────────────────────────────────────

const TEAM_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ARTICLE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// ── Helper ────────────────────────────────────────────────────────────────────

async function login(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase) {
  const res = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
  }, { ...TEST_ENV, DB: db })
  const body = await res.json<{ token: string }>()
  return body.token
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Draft promotion — relation target validation', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let token: string

  beforeEach(async () => {
    db = new D1TestDatabase({
      applyMigrations: true,
      seedSql: [DDL_TEAM, DDL_ARTICLES, DDL_ARTICLES_DRAFT],
    })
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [TEAM_SEED, ARTICLES_SEED] })
    token = await login(app, db)

    // Insert live article (needed for draft FK entry_id → content_dr_articles(id))
    await db.prepare(
      `INSERT INTO content_dr_articles (id, slug, status, title) VALUES (?, ?, 'draft', ?)`
    ).bind(ARTICLE_ID, 'test-article', 'Original Title').run()
  })

  it('1. draft with deleted relation target → 422 relation-target-not-found', async () => {
    // Insert team member, then save a draft referencing it
    await db.prepare(
      `INSERT INTO content_dr_team (id, slug, status, name) VALUES (?, ?, 'published', ?)`
    ).bind(TEAM_ID, 'member-1', 'Alice').run()

    // Save draft with valid author_id
    const saveDraft = await app.request(`/api/content/dr_articles/${ARTICLE_ID}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: 'Updated Title', author_id: TEAM_ID }),
    }, { ...TEST_ENV, DB: db })
    expect(saveDraft.status).toBe(200)

    // Delete the team member — draft still references it (no FK on drafts.author_id)
    await db.prepare(`DELETE FROM content_dr_team WHERE id = ?`).bind(TEAM_ID).run()

    // Promote draft — should fail with 422
    const publish = await app.request(`/api/content/dr_articles/${ARTICLE_ID}/draft/publish`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })

    expect(publish.status).toBe(422)
    const body = await publish.json<{ type: string; detail: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/relation-target-not-found')
    expect(body.detail).toContain('author_id')
    expect(body.detail).toContain(TEAM_ID)
  })

  it('2. draft with null author_id → 200', async () => {
    const saveDraft = await app.request(`/api/content/dr_articles/${ARTICLE_ID}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: 'Null Author', author_id: null }),
    }, { ...TEST_ENV, DB: db })
    expect(saveDraft.status).toBe(200)

    const publish = await app.request(`/api/content/dr_articles/${ARTICLE_ID}/draft/publish`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })

    expect(publish.status).toBe(200)
  })

  it('3. draft with valid author_id still in target table → 200, live row updated', async () => {
    await db.prepare(
      `INSERT INTO content_dr_team (id, slug, status, name) VALUES (?, ?, 'published', ?)`
    ).bind(TEAM_ID, 'member-2', 'Bob').run()

    const saveDraft = await app.request(`/api/content/dr_articles/${ARTICLE_ID}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: 'Bob Article', author_id: TEAM_ID }),
    }, { ...TEST_ENV, DB: db })
    expect(saveDraft.status).toBe(200)

    const publish = await app.request(`/api/content/dr_articles/${ARTICLE_ID}/draft/publish`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }, { ...TEST_ENV, DB: db })

    expect(publish.status).toBe(200)

    // Verify live row carries the author_id
    const row = await db.prepare(
      `SELECT author_id FROM content_dr_articles WHERE id = ?`
    ).bind(ARTICLE_ID).first<{ author_id: string }>()
    expect(row?.author_id).toBe(TEAM_ID)
  })
})
