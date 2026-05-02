/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Seed } from '@beech/core'

// --- Mock jose (auth bypass) ---
const mockJwtVerify = vi.hoisted(() => vi.fn())
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return { ...actual, jwtVerify: mockJwtVerify }
})

// --- Seed di test (hoisted so they're available inside vi.mock factory) ---
const { DRAFT_SEED, NO_DRAFT_SEED } = vi.hoisted(() => {
  const DRAFT_SEED = {
    slug: 'test-articoli',
    label: 'Articolo',
    displayNameAlias: 'title',
    allowDrafts: true,
    branches: [
      { id: 'br_01', alias: 'title', label: 'Titolo', type: 'text', requiredOnCreate: true },
      { id: 'br_02', alias: 'body', label: 'Corpo', type: 'text' },
    ],
  }
  const NO_DRAFT_SEED = {
    slug: 'test-messaggi',
    label: 'Messaggio',
    displayNameAlias: 'name',
    branches: [
      { id: 'br_01', alias: 'name', label: 'Nome', type: 'text' },
    ],
  }
  return { DRAFT_SEED, NO_DRAFT_SEED }
})

vi.mock('@beech/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@beech/core')>()
  return {
    ...actual,
    SEED_REGISTRY: {
      ...actual.SEED_REGISTRY,
      'test-articoli': DRAFT_SEED,
      'test-messaggi': NO_DRAFT_SEED,
    },
    getSeed: (slug: string) => {
      if (slug === 'test-articoli') return DRAFT_SEED
      if (slug === 'test-messaggi') return NO_DRAFT_SEED
      return actual.getSeed(slug)
    },
  }
})

import app from '../../index'

// --- Helpers ---

const ENTRY_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function makeAuthHeader() {
  return { Authorization: 'Bearer test-token' }
}

/**
 * v0.4.0 Helper: returns a row as it would appear in content_{slug} 
 */
function makeLiveRow(overrides: Record<string, any> = {}) {
  return {
    id: ENTRY_ID,
    slug: 'test-article',
    status: 'published',
    title: 'Titolo live',
    body: 'Corpo live',
    created_at: 1_000_000,
    updated_at: 1_000_000,
    ...overrides
  }
}

/**
 * v0.4.0 Helper: returns a row as it would appear in content_{slug}_drafts
 */
function makeDraftRow(overrides: Record<string, any> = {}) {
  return {
    entry_id: ENTRY_ID,
    title: 'Titolo in bozza',
    body: 'Corpo in bozza',
    updated_at: 1_000_001,
    ...overrides
  }
}

function makeMockDB(options: { 
  liveRow?: object | null, 
  draftRow?: object | null,
  bindCalls?: Array<{ sql: string; args: unknown[] }>
} = {}) {
  const { liveRow = null, draftRow = null, bindCalls = [] } = options

  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn((...args: unknown[]) => {
      bindCalls.push({ sql, args })
      return {
        first: vi.fn(async () => {
          if (sql.includes('_drafts')) return draftRow
          return liveRow
        }),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
        all: vi.fn(async () => ({ results: [] })),
      }
    }),
    first: vi.fn(async () => {
       if (sql.includes('_drafts')) return draftRow
       return liveRow
    }),
    run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
  }))

  return {
    prepare,
    batch: vi.fn(async (stmts: any[]) => {
      // In tests, we just assume they run fine
      return stmts.map(() => ({ success: true }))
    })
  } as unknown as D1Database
}

// --- Suite ---

describe('Draft feature — PUT /:slug/:id/draft', () => {
  beforeEach(() => {
    mockJwtVerify.mockReset()
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'admin@beech.local' },
      protectedHeader: { alg: 'HS256', typ: 'JWT' },
    })
  })

  it('returns 200 when draft is saved', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ title: 'Bozza titolo' }),
      },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: makeLiveRow() }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json<{ success: boolean }>()
    expect(json.success).toBe(true)
  })

  it('stores aliases as column names in content_{slug}_drafts', async () => {
    const bindCalls: Array<{ sql: string; args: unknown[] }> = []
    const mockDB = makeMockDB({ liveRow: makeLiveRow(), bindCalls })

    await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ title: 'Titolo in bozza' }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    const upsertCall = bindCalls.find((c) => c.sql.includes('INSERT INTO content_test-articoli_drafts'))
    expect(upsertCall).toBeDefined()
    // Column 'title' should be present in the SQL
    expect(upsertCall!.sql).toContain('title')
    // The value should be the second bind (first is ID)
    expect(upsertCall!.args[1]).toBe('Titolo in bozza')
  })

  it('returns 405 when seed does not allow drafts', async () => {
    const res = await app.request(
      `/api/content/test-messaggi/${ENTRY_ID}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ name: 'test' }),
      },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: makeLiveRow() }) }
    )
    expect(res.status).toBe(405)
  })

  it('returns 404 when entry does not exist', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ title: 'Test' }),
      },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: null }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('Draft feature — GET /:slug/:id/draft', () => {
  beforeEach(() => {
    mockJwtVerify.mockReset()
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'admin@beech.local' },
      protectedHeader: { alg: 'HS256', typ: 'JWT' },
    })
  })

  it('returns draft data with aliases', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: makeLiveRow(), draftRow: makeDraftRow() }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json<{ data: Record<string, unknown> }>()
    expect(json.data.title).toBe('Titolo in bozza')
    expect(json.data.body).toBe('Corpo in bozza')
  })

  it('returns 404 when no draft exists', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: makeLiveRow(), draftRow: null }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when entry does not exist', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: null }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('Draft feature — POST /:slug/:id/draft/publish', () => {
  beforeEach(() => {
    mockJwtVerify.mockReset()
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'admin@beech.local' },
      protectedHeader: { alg: 'HS256', typ: 'JWT' },
    })
  })

  it('returns 200 and promotes draft to live', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft/publish`,
      { method: 'POST', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: makeLiveRow(), draftRow: makeDraftRow() }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json<{ success: boolean }>()
    expect(json.success).toBe(true)
  })

  it('uses DB.batch to update live table and delete draft', async () => {
    const mockDB = makeMockDB({ liveRow: makeLiveRow(), draftRow: makeDraftRow() })
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft/publish`,
      { method: 'POST', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )
    expect(res.status).toBe(200)
    expect(mockDB.batch).toHaveBeenCalled()
  })

  it('returns 404 when no pending draft exists', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft/publish`,
      { method: 'POST', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: makeLiveRow(), draftRow: null }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('Draft feature — DELETE /:slug/:id/draft', () => {
  beforeEach(() => {
    mockJwtVerify.mockReset()
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'admin@beech.local' },
      protectedHeader: { alg: 'HS256', typ: 'JWT' },
    })
  })

  it('returns 200 when draft is discarded', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { method: 'DELETE', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ liveRow: makeLiveRow(), draftRow: makeDraftRow() }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json<{ success: boolean }>()
    expect(json.success).toBe(true)
  })

  it('issues DELETE FROM content_{slug}_drafts', async () => {
    const bindCalls: Array<{ sql: string; args: unknown[] }> = []
    const mockDB = makeMockDB({ liveRow: makeLiveRow(), bindCalls })

    await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { method: 'DELETE', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    const deleteCall = bindCalls.find((c) => c.sql.includes('DELETE FROM content_test-articoli_drafts'))
    expect(deleteCall).toBeDefined()
  })
})
