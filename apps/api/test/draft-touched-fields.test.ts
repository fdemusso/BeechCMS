// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach } from 'vitest'
import { D1ContentRepository } from '../src/shared/db/repositories/content.repository.d1'
import { D1TestDatabase } from './helpers/d1-test-database'
import { defineSeed, generateCreateTable, generateDraftTable, generateJunctionTable, generateJunctionDraftTable } from '@beechcms/core'

const TAGS_SEED = defineSeed({
  slug: 'tags',
  label: 'Tag',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
  ],
})

const POSTS_SEED = defineSeed({
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors', onDelete: 'SET NULL' },
    { id: 'br_03', alias: 'tags', label: 'Tags', type: 'relation', multiple: true, targetSeed: 'tags' },
  ],
})

const AUTHORS_SEED = defineSeed({
  slug: 'authors',
  label: 'Author',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
  ],
})

describe('D1ContentRepository — touched fields and multi-relation drafts integration', () => {
  let db: D1TestDatabase
  let repo: D1ContentRepository

  beforeEach(async () => {
    // Generate DDL dynamically
    const ddl = [
      generateCreateTable(AUTHORS_SEED),
      generateCreateTable(TAGS_SEED),
      generateCreateTable(POSTS_SEED),
      generateDraftTable(POSTS_SEED)!,
      generateJunctionTable(POSTS_SEED, POSTS_SEED.branches[2])!,
      generateJunctionDraftTable(POSTS_SEED, POSTS_SEED.branches[2])!,
    ]

    db = new D1TestDatabase({
      applyMigrations: true,
      seedSql: ddl,
    })
    repo = new D1ContentRepository(db)

    // Seed targets
    await db.prepare("INSERT INTO content_authors (id, slug, status, name) VALUES ('auth-1', 'john', 'published', 'John')").run()
    await db.prepare("INSERT INTO content_tags (id, slug, status, name) VALUES ('tag-1', 'news', 'published', 'News')").run()
    await db.prepare("INSERT INTO content_tags (id, slug, status, name) VALUES ('tag-2', 'tech', 'published', 'Tech')").run()

    // Insert live post with initial values
    await repo.create(POSTS_SEED, 'post-1', 'my-post', 'published', {
      title: 'Original Title',
      author_id: 'auth-1',
      tags: ['tag-1', 'tag-2'],
    })
  })

  it('preserves untouched fields (scalar and multi-relation) on draft publish', async () => {
    // 1. Save draft changing ONLY the title
    await repo.saveDraft(POSTS_SEED, 'post-1', {
      title: 'New Draft Title',
    })

    // 2. Fetch draft and verify untouched fields are NOT in getDraft output
    const draft = await repo.getDraft(POSTS_SEED, 'post-1')
    expect(draft).toEqual({
      title: 'New Draft Title',
    })

    // 3. Publish draft
    await repo.publishDraft(POSTS_SEED, 'post-1')

    // 4. Verify live post has new title, but original author_id and tags are preserved!
    const live = await repo.findById(POSTS_SEED, 'post-1')
    expect(live.title).toBe('New Draft Title')
    expect(live.author_id).toBe('auth-1')
    expect(live.tags).toEqual(['tag-1', 'tag-2'])
  })

  it('updates cleared fields (explicit null and empty relation array) on draft publish', async () => {
    // 1. Save draft clearing author_id (null) and tags (empty array)
    await repo.saveDraft(POSTS_SEED, 'post-1', {
      title: 'Cleared Draft Title',
      author_id: null,
      tags: [],
    })

    // 2. Fetch draft and verify they are present as null/empty
    const draft = await repo.getDraft(POSTS_SEED, 'post-1')
    expect(draft).toEqual({
      title: 'Cleared Draft Title',
      author_id: null,
      tags: [],
    })

    // 3. Publish draft
    await repo.publishDraft(POSTS_SEED, 'post-1')

    // 4. Verify live post values are cleared (null/empty array)
    const live = await repo.findById(POSTS_SEED, 'post-1')
    expect(live.title).toBe('Cleared Draft Title')
    expect(live.author_id).toBeNull()
    expect(live.tags).toEqual([])
  })
})
