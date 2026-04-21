/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Seed } from '@beech/core'

// --- Mock jose (auth bypass) ---
const mockJwtVerify = vi.hoisted(() => vi.fn())
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return { ...actual, jwtVerify: mockJwtVerify }
})

// --- Seed di test ---
const DRAFT_SEED: Seed = {
  slug: 'test-articoli',
  label: 'Articolo',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Titolo', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'body', label: 'Corpo', type: 'text' },
  ],
}

const NO_DRAFT_SEED: Seed = {
  slug: 'test-messaggi',
  label: 'Messaggio',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Nome', type: 'text' },
  ],
}

vi.mock('@beech/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@beech/core')>()
  return {
    ...actual,
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

function makeRow(overrides: Partial<{
  draft_data: string | null
  data: string
  status: string
}> = {}) {
  return {
    id: ENTRY_ID,
    schema_slug: 'test-articoli',
    slug: 'test-article',
    status: overrides.status ?? 'published',
    data: overrides.data ?? JSON.stringify({ br_01: 'Titolo live', br_02: 'Corpo live' }),
    draft_data: overrides.draft_data ?? null,
    has_pending_draft: overrides.draft_data != null ? 1 : 0,
    created_at: 1_000_000,
    updated_at: 1_000_000,
  }
}

function makeMockDB(row: object | null) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(() => Promise.resolve(row)),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
        all: vi.fn(() => Promise.resolve({ results: row ? [row] : [] })),
      })),
      first: vi.fn(() => Promise.resolve(row)),
      run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
    })),
  }
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
      { JWT_SECRET: 'test-secret', DB: makeMockDB(makeRow()) }
    )
    expect(res.status).toBe(200)
    const json = await res.json<{ success: boolean }>()
    expect(json.success).toBe(true)
  })

  it('stores Botanical IDs (not aliases) in draft_data', async () => {
    const bindCalls: Array<{ sql: string; args: unknown[] }> = []
    const mockDB = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push({ sql, args })
          return {
            first: vi.fn(() => Promise.resolve(makeRow())),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
            all: vi.fn(() => Promise.resolve({ results: [] })),
          }
        }),
        first: vi.fn(() => Promise.resolve(makeRow())),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
      })),
    }

    await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ title: 'Titolo in bozza' }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    const updateCall = bindCalls.find((c) => c.sql.includes('UPDATE') && c.sql.includes('draft_data'))
    expect(updateCall).toBeDefined()
    const saved = JSON.parse(updateCall!.args[0] as string)
    expect(saved.br_01).toBe('Titolo in bozza')
    expect(saved.title).toBeUndefined()
  })

  it('returns 405 when seed does not allow drafts', async () => {
    const res = await app.request(
      `/api/content/test-messaggi/${ENTRY_ID}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ name: 'test' }),
      },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(makeRow()) }
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
      { JWT_SECRET: 'test-secret', DB: makeMockDB(null) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when seed does not exist', async () => {
    const res = await app.request(
      `/api/content/seed-inesistente/${ENTRY_ID}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ title: 'Test' }),
      },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(null) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 401 when not authenticated', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('invalid token'))
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(null) }
    )
    expect(res.status).toBe(401)
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

  it('returns draft data with aliases (not Botanical IDs)', async () => {
    const draftDbData = JSON.stringify({ br_01: 'Titolo in bozza', br_02: 'Corpo in bozza' })
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ draft_data: draftDbData }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json<{ data: Record<string, unknown> }>()
    expect(json.data.title).toBe('Titolo in bozza')
    expect(json.data.body).toBe('Corpo in bozza')
    expect((json.data as Record<string, unknown>).br_01).toBeUndefined()
  })

  it('returns 404 when no draft exists', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ draft_data: null }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when entry does not exist', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(null) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 405 when seed does not allow drafts', async () => {
    const res = await app.request(
      `/api/content/test-messaggi/${ENTRY_ID}/draft`,
      { headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ draft_data: '{}' }) }
    )
    expect(res.status).toBe(405)
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
    const draftDbData = JSON.stringify({ br_01: 'Titolo da pubblicare' })
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft/publish`,
      { method: 'POST', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ draft_data: draftDbData }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json<{ success: boolean }>()
    expect(json.success).toBe(true)
  })

  it('issues UPDATE SET data = draft_data, draft_data = NULL', async () => {
    const draftDbData = JSON.stringify({ br_01: 'Titolo pubblicato' })
    const bindCalls: Array<{ sql: string; args: unknown[] }> = []
    const mockDB = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push({ sql, args })
          return {
            first: vi.fn(() => Promise.resolve({ draft_data: draftDbData })),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
            all: vi.fn(() => Promise.resolve({ results: [] })),
          }
        }),
        first: vi.fn(() => Promise.resolve({ draft_data: draftDbData })),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
      })),
    }

    await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft/publish`,
      { method: 'POST', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    const publishCall = bindCalls.find(
      (c) => c.sql.includes('data = draft_data') && c.sql.includes('draft_data = NULL')
    )
    expect(publishCall).toBeDefined()
    expect(publishCall!.args[0]).toBe('published')
  })

  it('returns 404 when no pending draft exists', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft/publish`,
      { method: 'POST', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ draft_data: null }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when entry does not exist', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft/publish`,
      { method: 'POST', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(null) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 405 when seed does not allow drafts', async () => {
    const res = await app.request(
      `/api/content/test-messaggi/${ENTRY_ID}/draft/publish`,
      { method: 'POST', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB({ draft_data: '{}' }) }
    )
    expect(res.status).toBe(405)
  })

  it('returns 401 when not authenticated', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('invalid token'))
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft/publish`,
      { method: 'POST' },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(null) }
    )
    expect(res.status).toBe(401)
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
      { JWT_SECRET: 'test-secret', DB: makeMockDB(makeRow({ draft_data: '{"br_01":"Bozza"}' })) }
    )
    expect(res.status).toBe(200)
    const json = await res.json<{ success: boolean }>()
    expect(json.success).toBe(true)
  })

  it('issues UPDATE SET draft_data = NULL', async () => {
    const bindCalls: Array<{ sql: string; args: unknown[] }> = []
    const mockDB = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push({ sql, args })
          return {
            first: vi.fn(() => Promise.resolve(makeRow())),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
            all: vi.fn(() => Promise.resolve({ results: [] })),
          }
        }),
        first: vi.fn(() => Promise.resolve(makeRow())),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
      })),
    }

    await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { method: 'DELETE', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    const discardCall = bindCalls.find(
      (c) => c.sql.includes('draft_data = NULL')
    )
    expect(discardCall).toBeDefined()
  })

  it('returns 404 when entry does not exist', async () => {
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { method: 'DELETE', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(null) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 405 when seed does not allow drafts', async () => {
    const res = await app.request(
      `/api/content/test-messaggi/${ENTRY_ID}/draft`,
      { method: 'DELETE', headers: makeAuthHeader() },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(makeRow()) }
    )
    expect(res.status).toBe(405)
  })

  it('returns 401 when not authenticated', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('invalid token'))
    const res = await app.request(
      `/api/content/test-articoli/${ENTRY_ID}/draft`,
      { method: 'DELETE' },
      { JWT_SECRET: 'test-secret', DB: makeMockDB(null) }
    )
    expect(res.status).toBe(401)
  })
})
