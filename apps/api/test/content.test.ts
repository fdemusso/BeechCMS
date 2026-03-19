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

/** Crea mock D1 per INSERT (POST): cattura i parametri passati a bind */
function createMockD1ForInsert(bindCapture: { args?: unknown[] }) {
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const bindMock = vi.fn((...args: unknown[]) => {
    bindCapture.args = args
    return { run: runMock }
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
    const bindCapture: { args?: unknown[] } = {}
    const mockDB = createMockD1ForInsert(bindCapture)

    const res = await app.request('/api/content/articoli', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(401)
    const data = await res.json() as { error?: string }
    expect(data.error).toBe('Unauthorized')
    // jwtVerify non deve essere chiamato: il middleware blocca prima
    expect(mockJwtVerify).not.toHaveBeenCalled()
  })

  it('POST /api/content/articoli con token malformato -> 401', async () => {
    mockJwtVerify.mockRejectedValue(new Error('Invalid token'))

    const bindCapture: { args?: unknown[] } = {}
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe('Unauthorized')
    expect(mockJwtVerify).toHaveBeenCalled()
  })

  it('POST con Authorization Bearer ma token vuoto -> 401', async () => {
    const bindCapture: { args?: unknown[] } = {}
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe('Unauthorized')
  })

  it('POST con token scaduto -> 401', async () => {
    mockJwtVerify.mockRejectedValue(new Error('Token expired'))

    const bindCapture: { args?: unknown[] } = {}
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
    const data = await res.json() as { error?: string }
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

  it('POST con body JSON: DB riceve data con art_xxx (Botanical Engine), risposta 201 con ID', async () => {
    const bindCapture: { args?: unknown[] } = {}
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
    const data = await res.json() as { id?: string }
    expect(data.id).toBeDefined()
    expect(typeof data.id).toBe('string')
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/i) // UUID format

    // Verifica critica: apiToDb trasforma alias -> branch.id; bind: id, schema_slug, slug, status, data, created_at, updated_at
    expect(bindCapture.args).toBeDefined()
    expect(bindCapture.args).toHaveLength(7)
    expect(bindCapture.args![3]).toBe('draft') // status default
    const dataParam = bindCapture.args![4]
    expect(typeof dataParam).toBe('string')
    const dbPayload = JSON.parse(dataParam as string)
    expect(dbPayload).toEqual({ art_01: 'Test' })
  })
})

describe('API Content - Read Operation (La Deserializzazione)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET /api/content/articoli: dbToApi trasforma art_xxx -> alias, risposta con data come oggetto', async () => {
    const rawRow: ContentEntryMockRow = {
      id: '123',
      schema_slug: 'articoli',
      slug: 'test-entry',
      status: 'published',
      data: '{"art_01":"Test","art_02":"2026-01-01"}',
      created_at: 1700000000,
      updated_at: 1700000000,
    }
    const mockDB = createMockD1ForList([rawRow])

    const res = await app.request('/api/content/articoli', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(200)
    const entries = await res.json() as Array<{ id: string; schema_slug: string; slug: string | null; status: string; data: unknown; created_at: number | null; updated_at: number | null }>
    expect(Array.isArray(entries)).toBe(true)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('123')
    expect(entries[0].schema_slug).toBe('articoli')
    expect(entries[0].slug).toBe('test-entry')
    expect(entries[0].status).toBe('published')
    // Verifica critica: dbToApi trasforma art_01/art_02 -> title/publishedAt
    expect(typeof entries[0].data).toBe('object')
    expect(entries[0].data).toEqual({ title: 'Test', publishedAt: '2026-01-01' })
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
    const rows: ContentEntryMockRow[] = [
      {
        id: '1',
        schema_slug: 'articoli',
        slug: 'a',
        status: 'review',
        data: '{"art_04":{"cms":"#111111","react":"#222222"}}',
        created_at: null,
        updated_at: null,
      },
      {
        id: '2',
        schema_slug: 'articoli',
        slug: 'b',
        status: 'published',
        data: '{"art_04":["react","typescript"]}',
        created_at: null,
        updated_at: null,
      },
      {
        id: '3',
        schema_slug: 'articoli',
        slug: 'c',
        status: 'published',
        data: '{"art_04":"[\\"edge\\",\\"cms\\"]"}',
        created_at: null,
        updated_at: null,
      },
    ]
    const mockDB = createMockD1ForList(rows)

    const res = await app.request('/api/content/articoli/facets', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(200)
    const data = await res.json() as {
      statuses: string[]
      tagsByColumnId: Record<string, string[]>
    }
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
    const rows: ContentEntryMockRow[] = [
      {
        id: '1',
        schema_slug: 'articoli',
        slug: 'a',
        status: 'review',
        data: '{"art_01":"Titolo A"}',
        created_at: 10,
        updated_at: 10,
      },
    ]
    const mockDB = createMockD1ForListWithCount(rows, 42, capture)

    const res = await app.request(
      '/api/content/articoli?search=titolo&sortBy=title&sortDir=asc&page=2&limit=10',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-token' },
      },
      { DB: mockDB, JWT_SECRET }
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: Array<{ id: string }>
      total: number
      page: number
      limit: number
    }
    expect(body.total).toBe(42)
    expect(body.page).toBe(2)
    expect(body.limit).toBe(10)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe('1')
    expect(capture.sql.length).toBeGreaterThanOrEqual(2)
    expect(capture.sql.some((s) => s.includes('COUNT(*)'))).toBe(true)
    expect(capture.sql.some((s) => s.includes('ORDER BY'))).toBe(true)
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.NOT_FOUND)
  })

  it('POST /api/content/slug-inesistente -> 404 SEED_NOT_FOUND', async () => {
    const mockDB = createMockD1ForInsert({})

    const res = await app.request('/api/content/slug-inesistente', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(404)
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.SEED_NOT_FOUND)
  })

  it('GET /api/content/slug-inesistente -> 404 SEED_NOT_FOUND', async () => {
    const mockDB = createMockD1ForList([])

    const res = await app.request('/api/content/slug-inesistente', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(404)
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.SEED_NOT_FOUND)
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.NOT_FOUND)
  })

  it('PUT con slug già usato da altra entry -> 409 SLUG_CONFLICT', async () => {
    const firstResults = [
      { slug: 'old-slug', status: 'draft' },
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.SLUG_CONFLICT)
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
    const entryRow = { id: 'entry-to-delete', data: '{}' }
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
    const data = await res.json() as { success?: boolean }
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.NOT_FOUND)
  })

  it('DELETE con entry contenente URL R2 -> elimina anche i file da R2', async () => {
    const entryWithMedia = {
      id: 'entry-with-cover',
      data: JSON.stringify({
        art_01: 'Articolo con copertina',
        art_03: 'https://example.com/api/media/1739-copertina.png',
      }),
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
    const data = await res.json() as { success?: boolean }
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.SLUG_CONFLICT)
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
    const row: ContentEntryMockRow = {
      id: 'id-by-slug',
      schema_slug: 'articoli',
      slug: 'my-entry',
      status: 'published',
      data: '{"art_01":"Titolo","art_02":"2026-01-01"}',
      created_at: 1700000000,
      updated_at: 1700000000,
    }
    const mockDB = createMockD1ForDetail(row)
    const res = await app.request('/api/content/articoli/by-slug/my-entry', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(200)
    const entry = await res.json() as { id: string; slug: string | null; status: string; data: unknown }
    expect(entry.id).toBe('id-by-slug')
    expect(entry.slug).toBe('my-entry')
    expect(entry.status).toBe('published')
    expect(entry.data).toEqual({ title: 'Titolo', publishedAt: '2026-01-01' })
  })

  it('GET /api/content/articoli/by-slug/slug-inesistente -> 404', async () => {
    const mockDB = createMockD1ForDetail(null)
    const res = await app.request('/api/content/articoli/by-slug/slug-inesistente', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })
    expect(res.status).toBe(404)
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.NOT_FOUND)
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
    const bindCapture: { args?: unknown[] } = {}
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.INVALID_JSON_BODY)
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.DATABASE_ERROR)
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.DATABASE_ERROR)
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.DATABASE_ERROR)
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
    const data = await res.json() as { error?: string }
    expect(data.error).toBe(CONTENT_ERRORS.DATABASE_ERROR)
  })
})

describe('API Content - Edge Case (Dati corrotti)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET con data JSON corrotto nel DB -> 200 con data: {} (nessun crash)', async () => {
    const rawRow: ContentEntryMockRow = {
      id: '456',
      schema_slug: 'articoli',
      slug: null,
      status: 'draft',
      data: 'invalid-json',
      created_at: 1700000000,
      updated_at: 1700000000,
    }
    const mockDB = createMockD1ForList([rawRow])

    const res = await app.request('/api/content/articoli', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(200)
    const entries = await res.json() as Array<{ id: string; data: unknown }>
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('456')
    expect(entries[0].data).toEqual({})
  })
})
