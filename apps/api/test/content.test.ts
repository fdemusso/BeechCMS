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

/** Crea mock D1 per SELECT all (GET lista): restituisce righe con data come stringa JSON */
function createMockD1ForList(rows: Array<{ id: string; schema_slug: string; data: string; created_at: number | null; updated_at: number | null }>) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({ results: rows }),
      })),
    })),
  }
}

/** Crea mock D1 per SELECT first (GET dettaglio): restituisce riga o null */
function createMockD1ForDetail(row: { id: string; schema_slug: string; data: string; created_at: number | null; updated_at: number | null } | null) {
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

    const res = await app.request('/api/content/progetti', {
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

  it('POST /api/content/progetti con token malformato -> 401', async () => {
    mockJwtVerify.mockRejectedValue(new Error('Invalid token'))

    const bindCapture: { args?: unknown[] } = {}
    const mockDB = createMockD1ForInsert(bindCapture)

    const res = await app.request('/api/content/progetti', {
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

    const res = await app.request('/api/content/progetti', {
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

    const res = await app.request('/api/content/progetti', {
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

  it('POST con body JSON: DB riceve data con br_xxx (Botanical Engine), risposta 201 con ID', async () => {
    const bindCapture: { args?: unknown[] } = {}
    const mockDB = createMockD1ForInsert(bindCapture)

    const body = { title: 'Test', budget: 1000 }

    const res = await app.request('/api/content/progetti', {
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

    // Verifica critica: apiToDb trasforma alias -> br_xxx
    expect(bindCapture.args).toBeDefined()
    expect(bindCapture.args).toHaveLength(5) // id, schema_slug, data, created_at, updated_at
    const dataParam = bindCapture.args![2]
    expect(typeof dataParam).toBe('string')
    const dbPayload = JSON.parse(dataParam as string)
    expect(dbPayload).toEqual({ br_01: 'Test', br_02: 1000 })
  })
})

describe('API Content - Read Operation (La Deserializzazione)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET /api/content/progetti: dbToApi trasforma br_xxx -> alias, risposta con data come oggetto', async () => {
    const rawRow = {
      id: '123',
      schema_slug: 'progetti',
      data: '{"br_01":"Test","br_02":1000}',
      created_at: 1700000000,
      updated_at: 1700000000,
    }
    const mockDB = createMockD1ForList([rawRow])

    const res = await app.request('/api/content/progetti', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    }, { DB: mockDB, JWT_SECRET })

    expect(res.status).toBe(200)
    const entries = await res.json() as Array<{ id: string; schema_slug: string; data: unknown; created_at: number | null; updated_at: number | null }>
    expect(Array.isArray(entries)).toBe(true)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('123')
    expect(entries[0].schema_slug).toBe('progetti')
    // Verifica critica: dbToApi trasforma br_01/br_02 -> title/budget
    expect(typeof entries[0].data).toBe('object')
    expect(entries[0].data).toEqual({ title: 'Test', budget: 1000 })
  })
})

describe('API Content - Edge Case (Not Found)', () => {
  beforeEach(() => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'test@beech.local' },
      protectedHeader: { alg: 'HS256' },
    } as never)
  })

  it('GET /api/content/progetti/999 con ID inesistente -> 404', async () => {
    const mockDB = createMockD1ForDetail(null)

    const res = await app.request('/api/content/progetti/999', {
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

    const res = await app.request('/api/content/progetti', {
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

    const res = await app.request('/api/content/progetti', {
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

    const res = await app.request('/api/content/progetti', {
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

    const res = await app.request('/api/content/progetti/123', {
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
    const rawRow = {
      id: '456',
      schema_slug: 'progetti',
      data: 'invalid-json{{{',
      created_at: 1700000000,
      updated_at: 1700000000,
    }
    const mockDB = createMockD1ForList([rawRow])

    const res = await app.request('/api/content/progetti', {
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
