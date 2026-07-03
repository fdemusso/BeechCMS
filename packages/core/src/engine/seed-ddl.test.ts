// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { planCreateSeed, planExtendSeed } from './seed-ddl.js'
import type { Seed } from './types.js'

const fullSeed: Seed = {
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { search: true } },
    { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext', policies: { search: true } },
    { id: 'br_03', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true },
  ],
}

describe('planCreateSeed', () => {
  it('includes CREATE TABLE for the seed', () => {
    const stmts = planCreateSeed(fullSeed)
    expect(stmts.some(s => s.includes('CREATE TABLE IF NOT EXISTS content_posts'))).toBe(true)
  })

  it('includes draft table when allowDrafts=true', () => {
    const stmts = planCreateSeed(fullSeed)
    expect(stmts.some(s => s.includes('content_posts_drafts'))).toBe(true)
  })

  it('includes FTS table for searchable text/richtext branches', () => {
    const stmts = planCreateSeed(fullSeed)
    expect(stmts.some(s => s.includes('fts_posts') || s.includes('USING fts5'))).toBe(true)
  })

  it('includes FTS triggers', () => {
    const stmts = planCreateSeed(fullSeed)
    // FTS triggers: at least insert, update, delete
    const triggerCount = stmts.filter(s => s.toUpperCase().includes('CREATE TRIGGER')).length
    expect(triggerCount).toBeGreaterThanOrEqual(3)
  })

  it('includes junction table for multi-relation branch', () => {
    const stmts = planCreateSeed(fullSeed)
    expect(stmts.some(s => s.includes('rel_posts_tags'))).toBe(true)
  })

  it('order: CREATE TABLE before draft table', () => {
    const stmts = planCreateSeed(fullSeed)
    const mainIdx = stmts.findIndex(s => s.includes('CREATE TABLE IF NOT EXISTS content_posts') && !s.includes('drafts'))
    const draftIdx = stmts.findIndex(s => s.includes('content_posts_drafts'))
    expect(mainIdx).toBeLessThan(draftIdx)
  })

  it('no DROP or RENAME statements', () => {
    const stmts = planCreateSeed(fullSeed)
    for (const s of stmts) {
      expect(s.toUpperCase()).not.toContain('DROP ')
      expect(s.toUpperCase()).not.toContain('RENAME ')
    }
  })
})

describe('planExtendSeed', () => {
  const existing = new Set(['title', 'body'])

  it('returns ADD COLUMN for new non-relation branch', () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'body', label: 'Body', type: 'text' },
        { id: 'br_03', alias: 'summary', label: 'Summary', type: 'text' },
      ],
    }
    const { statements } = planExtendSeed(seed, existing)
    const addCols = statements.filter(s => s.toUpperCase().includes('ADD COLUMN'))
    expect(addCols).toHaveLength(1)
    expect(addCols[0]).toContain('summary')
  })

  it('ftsRebuildNeeded=true when new searchable text branch added', () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'newfield', label: 'New', type: 'text', policies: { search: true } },
      ],
    }
    const { ftsRebuildNeeded } = planExtendSeed(seed, new Set(['title']))
    expect(ftsRebuildNeeded).toBe(true)
  })

  it('ftsRebuildNeeded=false when new branch is not searchable', () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'count', label: 'Count', type: 'number' },
      ],
    }
    const { ftsRebuildNeeded } = planExtendSeed(seed, new Set(['title']))
    expect(ftsRebuildNeeded).toBe(false)
  })

  it('includes junction CREATE TABLE for new multi-relation branch', () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'cats', label: 'Categories', type: 'relation', targetSeed: 'cats', multiple: true },
      ],
    }
    const { statements } = planExtendSeed(seed, new Set(['title']))
    expect(statements.some(s => s.includes('rel_posts_cats'))).toBe(true)
  })

  it('returns one additive ADD COLUMN for a new repeater branch, no index/fts/junction', () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        {
          id: 'br_02', alias: 'items', label: 'Items', type: 'repeater',
          fields: [{ id: 'br_03', alias: 'question', label: 'Question', type: 'text' }],
        },
      ],
    }
    const { statements, ftsRebuildNeeded } = planExtendSeed(seed, new Set(['title']))
    const addCols = statements.filter(s => s.toUpperCase().includes('ADD COLUMN'))
    expect(addCols).toEqual(['ALTER TABLE content_posts ADD COLUMN items TEXT;'])
    expect(statements.some(s => s.includes('idx_posts_items'))).toBe(false)
    expect(statements.some(s => s.includes('rel_posts_items'))).toBe(false)
    expect(ftsRebuildNeeded).toBe(false)
  })

  it('skips existing columns', () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'body', label: 'Body', type: 'text' },
      ],
    }
    const { statements } = planExtendSeed(seed, new Set(['title', 'body']))
    expect(statements.filter(s => s.toUpperCase().includes('ADD COLUMN'))).toHaveLength(0)
  })

  it('emits no DROP or RENAME', () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Posts',
      displayNameAlias: 'title',
      branches: [{ id: 'br_01', alias: 'newthing', label: 'New', type: 'text' }],
    }
    const { statements } = planExtendSeed(seed, new Set())
    for (const s of statements) {
      expect(s.toUpperCase()).not.toContain('DROP ')
      expect(s.toUpperCase()).not.toContain('RENAME ')
    }
  })
})
