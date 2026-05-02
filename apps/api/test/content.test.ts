/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock jose: vi.hoisted assicura che la fn esista prima del factory
const mockJwtVerify = vi.hoisted(() => vi.fn())
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    jwtVerify: mockJwtVerify,
  }
})

import app from '../src/index'
import { CONTENT_ERRORS } from '../src/content'

const JWT_SECRET = 'test-secret-key'

/** Crea mock D1 per INSERT (POST): cattura i parametri passati a ogni chiamata bind */
function createMockD1ForInsert(bindCapture: { calls: unknown[][] }) {
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const firstMock = vi.fn().mockResolvedValue(null) // default: slug not found
  const bindMock = vi.fn((...args: unknown[]) => {
    bindCapture.calls.push(args)
    return { run: runMock, first: firstMock }
  })
  return {
    prepare: vi.fn(() => ({
      bind: bindMock,
    })),
  }
}

type ContentEntryMockRow = {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  data: string
  created_at: number | null
  updated_at: number | null
}

/** Crea mock D1 per SELECT all (GET lista): restituisce righe con data come stringa JSON */
function createMockD1ForList(rows: ContentEntryMockRow[]) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({ results: rows }),
      })),
    })),
  }
}

/** Crea mock D1 per GET lista con COUNT + SELECT paginato */
function createMockD1ForListWithCount(
  rows: ContentEntryMockRow[],
  total: number,
  capture: { sql: string[]; binds: unknown[][] }
) {
  return {
    prepare: vi.fn((sql: string) => {
      capture.sql.push(sql)
      return {
        bind: vi.fn((...args: unknown[]) => {
          capture.binds.push(args)
          if (sql.toLowerCase().includes('count(*)')) {
            return {
              first: vi.fn().mockResolvedValue({ total }),
            }
          }
          return {
            all: vi.fn().mockResolvedValue({ results: rows }),
          }
        }),
      }
    }),
  }
}

/** Crea mock D1 per SELECT first (GET dettaglio / by-slug): restituisce riga o null */
function createMockD1ForDetail(row: ContentEntryMockRow | null) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(row),
      })),
    })),
  }
}

describe('API Content - Security Layer (Il Guardiano)', () => {
  beforeEach(() => {
    mockJwtVerify.mockReset()
  })

  it('POST senza Authorization -> 401', async () => {
    const bindCapture: { calls: unknown[][] } = { calls: [] }
    const mockDB = createMockD1ForInsert(bindCapture)

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(401)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.error).toBe('Unauthorized')
    // jwtVerify non deve essere chiamato: il middleware blocca prima
    expect(mockJwtVerify).not.toHaveBeenCalled()
  })

  it('POST /api/content/articoli con token malformato -> 401', async () => {
    mockJwtVerify.mockRejectedValue(new Error('Invalid token'))

    const bindCapture: { calls: unknown[][] } = { calls: [] }
    const mockDB = createMockD1ForInsert(bindCapture)

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token',
      },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(401)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.error).toBe('Unauthorized')
    expect(mockJwtVerify).toHaveBeenCalled()
  })

  it('POST con Authorization Bearer ma token vuoto -> 401', async () => {
    const bindCapture: { calls: unknown[][] } = { calls: [] }
    const mockDB = createMockD1ForInsert(bindCapture)

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ',
      },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(401)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.error).toBe('Unauthorized')
  })

  it('POST con token scaduto -> 401', async () => {
    mockJwtVerify.mockRejectedValue(new Error('Token expired'))

    const bindCapture: { calls: unknown[][] } = { calls: [] }
    const mockDB = createMockD1ForInsert(bindCapture)

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer expired-token',
      },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(401)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.error).toBe('Unauthorized')
  })
})

describe('API Content - Write Operation (La Serializzazione)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('POST successo con slug auto-generato -> 201', async () => {
    const bindCapture: { calls: unknown[][] } = { calls: [] }
    const mockDB = createMockD1ForInsert(bindCapture)

    const body = { title: 'Test' }

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(201)
    const data = await res.json<{ id?: string }>()
    expect(data.id).toBeDefined()
    expect(typeof data.id).toBe('string')
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/i) // UUID format

    // v0.4.0: 
    // 1. SELECT id FROM content_articoli WHERE slug = ?
    // 2. INSERT INTO content_articoli (id, slug, status, created_at, updated_at, title, ...) VALUES (?, ?, ?, ?, ?, ?, ...)
    expect(bindCapture.calls).toBeDefined()
    expect(bindCapture.calls.length).toBeGreaterThanOrEqual(2)
    
    // Check call 0: slug check
    expect(bindCapture.calls[0]).toHaveLength(1)

    // Check call 1: insert
    const insertCall = bindCapture.calls[1]
    expect(insertCall.length).toBeGreaterThanOrEqual(6)
    expect(insertCall[1]).toBeDefined() // finalSlug (auto-generated)
    expect(insertCall[2]).toBe('draft') // status default
    // bindings: id, slug, status, created_at, updated_at, ...branches
    // title is the first branch of 'articoli'
    expect(insertCall[5]).toBe('Test')  // title field value
  })
})

describe('API Content - Read Operation (La Deserializzazione)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET /api/content/articoli: risposta con data come oggetto alias-keyed', async () => {
    // v0.4.0: rows have real columns (no JSON blob)
    const rawRow = {
      id: '123',
      slug: 'test-entry',
      status: 'published',
      title: 'Test',
      publishedAt: 1735689600,  // 2026-01-01 UTC as unix timestamp
      coverImage: null,
      tags: null,
      body: null,
      metaTitle: null,
      metaDescription: null,
      has_pending_draft: 0,
      created_at: 1700000000,
      updated_at: 1700000000,
    }
    const mockDB = createMockD1ForList([rawRow as unknown as ContentEntryMockRow])

    const res = await app.request('/api/content/articoli', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(200)
    const entries = await res.json<Array<{ id: string; schema_slug: string; slug: string | null; status: string; data: unknown; created_at: number | null; updated_at: number | null }>>()
    expect(Array.isArray(entries)).toBe(true)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('123')
    expect(entries[0].schema_slug).toBe('articoli')
    expect(entries[0].slug).toBe('test-entry')
    expect(entries[0].status).toBe('published')
    expect(typeof entries[0].data).toBe('object')
    // title is deserialized from real column
    expect((entries[0].data as Record<string, unknown>).title).toBe('Test')
  })
})

describe('API Content - Facets dinamici', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET /api/content/articoli/facets restituisce status e tags distinti', async () => {
    // v0.4.0: facets query is SELECT status, tags FROM content_articoli (no bind call)
    const rows = [
      { status: 'review',    tags: JSON.stringify({ cms: '#111111', react: '#222222' }) },
      { status: 'published', tags: JSON.stringify(['react', 'typescript']) },
      { status: 'published', tags: '["edge","cms"]' },
    ]
    const mockDB = {
      prepare: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({ results: rows }),
        // also expose bind for other queries
        bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: rows }) })),
      })),
    }

    const res = await app.request('/api/content/articoli/facets', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(200)
    const data = await res.json<{
      statuses: string[]
      tagsByColumnId: Record<string, string[]>
    }>()
    expect(data.statuses).toEqual(['published', 'review'])
    expect(data.tagsByColumnId.tags).toBeDefined()
    expect(new Set(data.tagsByColumnId.tags)).toEqual(
      new Set(['cms', 'edge', 'react', 'typescript'])
    )
  })
})

describe('API Content - Query params server-side', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET /api/content/:slug con search/sort/pagination restituisce payload con meta', async () => {
    const capture = { sql: [] as string[], binds: [] as unknown[][] }
    // v0.4.0: real columns
    const rows = [
      { id: '1', slug: 'a', status: 'review', title: 'Titolo A', has_pending_draft: 0, created_at: 10, updated_at: 10 },
    ]
    const mockDB = createMockD1ForListWithCount(rows as unknown as ContentEntryMockRow[], 42, capture)

    const res = await app.request(
      '/api/content/articoli?search=titolo&sortBy=title&sortDir=asc&page=2&limit=10',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-token' },
      },
      { DB: mockDB, JWT_SECRET }
    )

    expect(res.status).toBe(200)
    const body = await res.json<{
      items: Array<{ id: string }>
      total: number
      page: number
      limit: number
    }>()
    expect(body.total).toBe(42)
    expect(body.page).toBe(2)
    expect(body.limit).toBe(10)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe('1')
    expect(capture.sql.length).toBeGreaterThanOrEqual(2)
    expect(capture.sql.some((s) => s.includes('COUNT(*)'))).toBe(true)
    expect(capture.sql.some((s) => s.includes('ORDER BY'))).toBe(true)
  })

  it('GET /api/content/:slug con filters genera WHERE e bindings attesi', async () => {
    const capture = { sql: [] as string[], binds: [] as unknown[][] }
    // v0.4.0: rows have real columns (no JSON blob)
    const rows = [
      { id: '1', slug: 'a', status: 'published', name: 'Nome A', price: 123.45, stock: 10, active: 1, has_pending_draft: 0, created_at: 10, updated_at: 10 },
    ]
    const mockDB = createMockD1ForListWithCount(rows as unknown as ContentEntryMockRow[], 1, capture)

    const filters = {
      emptyName: {
        columnId: 'name',
        type: 'text',
        conditions: [{ op: 'is_empty', value: null }],
      },
      tagsImages: {
        columnId: 'images',
        type: 'tags',
        conditions: [{ op: 'contains', value: 'react' }],
      },
      eqActive: {
        columnId: 'active',
        type: 'boolean',
        conditions: [{ op: 'eq', value: true }],
      },
      eqPrice: {
        columnId: 'price',
        type: 'number',
        conditions: [{ op: 'eq', value: 123.45 }],
      },
      containsName: {
        columnId: 'name',
        type: 'text',
        conditions: [{ op: 'contains', value: 'Progetto' }],
      },
      gtStock: {
        columnId: 'stock',
        type: 'number',
        conditions: [{ op: 'gt', value: 10 }],
      },
      lteDatePrice: {
        columnId: 'price',
        type: 'date',
        conditions: [{ op: 'lte', value: '2026-01-01' }],
      },
    }

    const filtersParam = encodeURIComponent(JSON.stringify(filters))
    const res = await app.request(
      `/api/content/prodotti?filters=${filtersParam}&page=1&limit=10`,
      {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-token' },
      },
      { DB: mockDB, JWT_SECRET },
    )

    expect(res.status).toBe(200)

    const body = await res.json<{
      items: Array<{ id: string }>
      total: number
      page: number
      limit: number
    }>()
    expect(body.total).toBe(1)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(10)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe('1')

    // v0.4.0: real columns — no json_extract, json_each used for json-type arrays
    const allSql = capture.sql.join(' ')
    expect(allSql).toContain('json_each')          // images is json/file type with array support
    expect(allSql).not.toContain('json_extract')   // v0.4.0: no json_extract

    // Verify key bindings are present (order depends on filter DSL)
    const allBinds = capture.binds.flat()
    expect(allBinds).toContain('react')       // images contains filter
    expect(allBinds).toContain(1)             // active=true → 1
    expect(allBinds).toContain(123.45)        // price eq
    expect(allBinds).toContain('%Progetto%')  // name contains
    expect(allBinds).toContain(10)            // stock gt
    // limit and offset in last binds call
    const lastBinds = capture.binds[capture.binds.length - 1]
    expect(lastBinds).toContain(10)  // limit
    expect(lastBinds).toContain(0)   // offset
  })
})

describe('API Content - Edge Case (Not Found)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET /api/content/articoli/999 con ID inesistente -> 404', async () => {
    const mockDB = createMockD1ForDetail(null)

    const res = await app.request('/api/content/articoli/999', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(404)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.NOT_FOUND)
  })

  it('POST /api/content/slug-inesistente -> 404 SEED_NOT_FOUND', async () => {
    const mockDB = createMockD1ForInsert({ calls: [] })

    const res = await app.request('/api/content/slug-inesistente', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(404)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.SEED_NOT_FOUND)
  })

  it('GET /api/content/slug-inesistente -> 404 SEED_NOT_FOUND', async () => {
    const mockDB = createMockD1ForList([])

    const res = await app.request('/api/content/slug-inesistente', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(404)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.SEED_NOT_FOUND)
  })
})

describe('API Content - PUT (Aggiornamento)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('PUT con ID inesistente -> 404', async () => {
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(null),
        })),
      })),
    }
    const res = await app.request('/api/content/articoli/non-existent-id', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(404)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.NOT_FOUND)
  })

  it('PUT con slug già usato da altra entry -> 409 SLUG_CONFLICT', async () => {
    const firstResults = [
      { slug: 'old-slug', status: 'draft' },
      {
        id: 'entry-123',
        slug: 'old-slug',
        status: 'draft',
        title: 'Titolo',
        created_at: 1700000000,
        updated_at: 1700000000,
      },
      { id: 'other-entry-id' },
    ]
    let callIndex = 0
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockImplementation(() =>
            Promise.resolve(firstResults[callIndex++]),
          ),
        })),
      })),
    }
    const res = await app.request('/api/content/articoli/entry-123', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated', slug: 'slug-gia-usato' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(409)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.SLUG_CONFLICT)
  })
})

describe('API Content - DELETE (Eliminazione)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('DELETE con ID esistente -> 200 success', async () => {
    // v0.4.0: row has real columns (no JSON blob)
    const entryRow = { id: 'entry-to-delete', status: 'published', slug: 'test' }
    const mockDB = {
      prepare: vi.fn()
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(entryRow),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
          }),
        }),
    }
    const res = await app.request('/api/content/articoli/entry-to-delete', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(200)
    const data = await res.json<{ success?: boolean }>()
    expect(data.success).toBe(true)
  })

  it('DELETE con ID inesistente -> 404', async () => {
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(null),
        })),
      })),
    }
    const res = await app.request('/api/content/articoli/non-existent-id', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(404)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.NOT_FOUND)
  })

  it('DELETE con entry contenente URL R2 -> elimina anche i file da R2', async () => {
    // v0.4.0: real columns — coverImage is the file column
    const entryWithMedia = {
      id: 'entry-with-cover',
      status: 'published',
      slug: 'articolo-con-copertina',
      title: 'Articolo con copertina',
      coverImage: 'https://example.com/api/media/1739-copertina.png',
    }
    const mockDB = {
      prepare: vi.fn()
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(entryWithMedia),
          }),
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
          }),
        }),
    }
    const res = await app.request('/api/content/articoli/entry-with-cover', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(200)
    const data = await res.json<{ success?: boolean }>()
    expect(data.success).toBe(true)
  })
})

describe('API Content - Slug conflict (409)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('POST con slug già esistente per lo stesso schema -> 409 SLUG_CONFLICT', async () => {
    const slugCheckMock = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({ id: 'existing-id' }),
        })),
      })),
    }
    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', slug: 'slug-gia-usato' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, { DB: slugCheckMock, JWT_SECRET })

    expect(res.status).toBe(409)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.SLUG_CONFLICT)
  })
})

describe('API Content - GET by-slug', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET /api/content/articoli/by-slug/my-entry restituisce entry quando slug esiste', async () => {
    // v0.4.0: real columns
    const row = {
      id: 'id-by-slug',
      slug: 'my-entry',
      status: 'published',
      title: 'Titolo',
      publishedAt: 1735689600,
      coverImage: null,
      tags: null,
      body: null,
      metaTitle: null,
      metaDescription: null,
      created_at: 1700000000,
      updated_at: 1700000000,
    }
    const mockDB = createMockD1ForDetail(row as unknown as ContentEntryMockRow)
    const res = await app.request('/api/content/articoli/by-slug/my-entry', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(200)
    const entry = await res.json<{ id: string; slug: string | null; status: string; data: unknown }>()
    expect(entry.id).toBe('id-by-slug')
    expect(entry.slug).toBe('my-entry')
    expect(entry.status).toBe('published')
    expect((entry.data as Record<string, unknown>).title).toBe('Titolo')
  })

  it('GET /api/content/articoli/by-slug/slug-inesistente -> 404', async () => {
    const mockDB = createMockD1ForDetail(null)
    const res = await app.request('/api/content/articoli/by-slug/slug-inesistente', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(404)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.NOT_FOUND)
  })
})

describe('API Content - Validazione slug', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('POST con body non JSON -> 400', async () => {
    const bindCapture: { calls: unknown[][] } = { calls: [] }
    const mockDB = createMockD1ForInsert(bindCapture)

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: 'not valid json',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(400)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.INVALID_JSON_BODY)
  })
})

describe('API Content - Errori DB (500)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('POST con fallimento DB -> 500', async () => {
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ run: vi.fn().mockRejectedValue(new Error('DB error')) })),
      })),
    }

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(500)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.DATABASE_ERROR)
  })

  it('GET lista con fallimento DB -> 500', async () => {
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ all: vi.fn().mockRejectedValue(new Error('DB error')) })),
      })),
    }

    const res = await app.request('/api/content/articoli', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(500)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.DATABASE_ERROR)
  })

  it('GET dettaglio con fallimento DB -> 500', async () => {
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ first: vi.fn().mockRejectedValue(new Error('DB error')) })),
      })),
    }

    const res = await app.request('/api/content/articoli/123', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(500)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.DATABASE_ERROR)
  })

  it('GET by-slug con fallimento DB -> 500', async () => {
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ first: vi.fn().mockRejectedValue(new Error('DB error')) })),
      })),
    }

    const res = await app.request('/api/content/articoli/by-slug/my-entry', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(500)
    const data = await res.json<{ error?: string; detail?: string }>()
    expect(data.detail).toBe(CONTENT_ERRORS.DATABASE_ERROR)
  })
})

describe('API Content - Edge Case (Dati corrotti)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET con row senza campi facoltativi -> 200 con data: tutti null (nessun crash)', async () => {
    // v0.4.0: no JSON blob — null columns come from DB directly
    const rawRow = {
      id: '456',
      slug: null,
      status: 'draft',
      title: null,
      publishedAt: null,
      coverImage: null,
      tags: null,
      body: null,
      metaTitle: null,
      metaDescription: null,
      has_pending_draft: 0,
      created_at: 1700000000,
      updated_at: 1700000000,
    }
    const mockDB = createMockD1ForList([rawRow as unknown as ContentEntryMockRow])

    const res = await app.request('/api/content/articoli', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(200)
    const entries = await res.json<Array<{ id: string; data: unknown }>>()
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('456')
    expect(typeof entries[0].data).toBe('object')
  })
})
