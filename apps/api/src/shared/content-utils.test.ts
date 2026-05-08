import { describe, it, expect, vi } from 'vitest'
import { rowToApiData, rowToEntry, buildInsertBindings, buildUpdateBindings, hasDraft } from './content-utils'
import type { Seed } from '@beechcms/core'

const SEED = {
  slug: 'articoli',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text' },
    { id: 'br_02', alias: 'body', type: 'text' },
  ],
} as unknown as Seed

const NO_DRAFT_SEED = {
  slug: 'prodotti',
  displayNameAlias: 'nome',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'nome', type: 'text' },
  ],
} as unknown as Seed

// ─── rowToApiData ─────────────────────────────────────────────────────────────

describe('rowToApiData', () => {
  it('returns an object keyed by branch aliases with deserialized values', () => {
    const result = rowToApiData(SEED, { title: 'Hello', body: 'World' })
    expect(result).toHaveProperty('title', 'Hello')
    expect(result).toHaveProperty('body', 'World')
  })

  it('uses null for missing branch values', () => {
    const result = rowToApiData(SEED, {})
    expect(result.title).toBeNull()
    expect(result.body).toBeNull()
  })

  it('only includes keys for branches defined in the seed', () => {
    const result = rowToApiData(SEED, { title: 'Hi', unknownCol: 'ignored' })
    expect(Object.keys(result)).toEqual(['title', 'body'])
    expect(result).not.toHaveProperty('unknownCol')
  })
})

// ─── rowToEntry ───────────────────────────────────────────────────────────────

describe('rowToEntry', () => {
  it('maps a DB row to a ContentEntry with correct system fields', () => {
    const row = {
      id: 'entry-1', slug: 'my-post', status: 'published',
      title: 'Hello', body: 'World', created_at: 1000, updated_at: 2000,
    }
    const entry = rowToEntry(SEED, row)
    expect(entry.id).toBe('entry-1')
    expect(entry.schema_slug).toBe('articoli')
    expect(entry.slug).toBe('my-post')
    expect(entry.status).toBe('published')
    expect(entry.created_at).toBe(1000)
    expect(entry.updated_at).toBe(2000)
    expect(entry.hasPendingDraft).toBe(false)
  })

  it('defaults hasPendingDraft to false when not provided', () => {
    const entry = rowToEntry(SEED, { id: 'e1', slug: null, status: 'draft', title: null, body: null, created_at: null, updated_at: null })
    expect(entry.hasPendingDraft).toBe(false)
  })

  it('passes through hasPendingDraft when explicitly set to true', () => {
    const entry = rowToEntry(SEED, { id: 'e1', slug: null, status: 'draft', title: null, body: null }, true)
    expect(entry.hasPendingDraft).toBe(true)
  })

  it('defaults slug to null and status to draft for missing values', () => {
    const entry = rowToEntry(SEED, { id: 'e1' })
    expect(entry.slug).toBeNull()
    expect(entry.status).toBe('draft')
  })
})

// ─── buildInsertBindings ──────────────────────────────────────────────────────

describe('buildInsertBindings', () => {
  it('returns cols, placeholders, and bindings for each matching branch alias', () => {
    const { cols, placeholders, bindings } = buildInsertBindings(SEED, { title: 'Hi', body: 'There' })
    expect(cols).toContain('title')
    expect(cols).toContain('body')
    expect(placeholders).toHaveLength(2)
    expect(placeholders.every(p => p === '?')).toBe(true)
    expect(bindings).toHaveLength(2)
  })

  it('omits branches not present in the payload', () => {
    const { cols, bindings } = buildInsertBindings(SEED, { title: 'Only title' })
    expect(cols).toEqual(['title'])
    expect(bindings).toHaveLength(1)
  })

  it('returns empty arrays when payload has no matching aliases', () => {
    const { cols, placeholders, bindings } = buildInsertBindings(SEED, { unknownField: 'x' })
    expect(cols).toHaveLength(0)
    expect(placeholders).toHaveLength(0)
    expect(bindings).toHaveLength(0)
  })
})

// ─── buildUpdateBindings ──────────────────────────────────────────────────────

describe('buildUpdateBindings', () => {
  it('returns a SET clause and bindings for each matching branch alias', () => {
    const { setClause, bindings } = buildUpdateBindings(SEED, { title: 'New', body: 'Content' })
    expect(setClause).toContain('title = ?')
    expect(setClause).toContain('body = ?')
    expect(bindings).toHaveLength(2)
  })

  it('builds a single-field SET clause', () => {
    const { setClause, bindings } = buildUpdateBindings(SEED, { title: 'Updated' })
    expect(setClause).toBe('title = ?')
    expect(bindings).toHaveLength(1)
  })

  it('returns empty setClause and bindings for non-matching payload', () => {
    const { setClause, bindings } = buildUpdateBindings(SEED, { ghost: 'field' })
    expect(setClause).toBe('')
    expect(bindings).toHaveLength(0)
  })
})

// ─── hasDraft ─────────────────────────────────────────────────────────────────

describe('hasDraft', () => {
  function makeMockDb(firstResult: unknown) {
    const firstMock = vi.fn().mockResolvedValue(firstResult)
    const bindMock = vi.fn(() => ({ first: firstMock }))
    const prepareMock = vi.fn(() => ({ bind: bindMock }))
    return { db: { prepare: prepareMock } as any, prepareMock, bindMock }
  }

  it('returns false immediately when seed does not allow drafts', async () => {
    const { db, prepareMock } = makeMockDb(null)
    expect(await hasDraft(db, NO_DRAFT_SEED, 'e1')).toBe(false)
    expect(prepareMock).not.toHaveBeenCalled()
  })

  it('returns true when a draft row exists', async () => {
    const { db } = makeMockDb({ 1: 1 })
    expect(await hasDraft(db, SEED, 'entry-1')).toBe(true)
  })

  it('returns false when no draft row is found', async () => {
    const { db } = makeMockDb(null)
    expect(await hasDraft(db, SEED, 'entry-1')).toBe(false)
  })

  it('queries the correct drafts table for the seed slug', async () => {
    const { db, prepareMock } = makeMockDb(null)
    await hasDraft(db, SEED, 'entry-1')
    expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('content_articoli_drafts'))
  })
})
