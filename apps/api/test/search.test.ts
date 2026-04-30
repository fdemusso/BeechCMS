/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi } from 'vitest'

const mockJwtVerify = vi.hoisted(() => vi.fn())
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return { ...actual, jwtVerify: mockJwtVerify }
})

import app from '../src/index'
import { beforeEach } from 'vitest'

const JWT_SECRET = 'test-secret-key'

beforeEach(() => mockJwtVerify.mockReset())

type FtsRow = {
  entry_id: string
  schema_slug: string
  title: string
  body: string
  tags: string
  status: string
  excerpt: string
  rank: number
}

type FullRow = { id: string; slug: string | null; data: string }

/**
 * Mock D1 per la route /api/search.
 * Tre prepare() distinte per:
 *  - FTS query           → .all() FTS rows
 *  - COUNT query         → .first() { total }
 *  - full rows fetch     → .all() content_entries rows
 */
function createSearchMockD1(opts: {
  ftsRows: FtsRow[]
  total: number
  fullRows: FullRow[]
}) {
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue({ total: opts.total }),
          })),
        }
      }
      if (sql.includes('content_entries')) {
        return {
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: opts.fullRows }),
          })),
        }
      }
      // FTS query
      return {
        bind: vi.fn(() => ({
          all: vi.fn().mockResolvedValue({ results: opts.ftsRows }),
        })),
      }
    }),
  }
}

function authHeader() {
  return { Authorization: 'Bearer valid-token' }
}

function mockAuthOk() {
  mockJwtVerify.mockResolvedValue({
    payload: { sub: 'user-1' },
    protectedHeader: { alg: 'HS256' },
  })
}

describe('GET /api/search', () => {
  describe('validazione parametri', () => {
    it('restituisce 401 senza token di autenticazione', async () => {
      // Il middleware blocca prima di chiamare jwtVerify (nessun header Bearer)
      const res = await app.request(
        '/api/search?q=test',
        { method: 'GET' },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(401)
    })

    it('restituisce 400 quando q è assente', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(400)
    })

    it('restituisce 400 quando q ha meno di 2 caratteri', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=a',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(400)
    })
  })

  describe('gestione EMPTY_QUERY', () => {
    it('restituisce 200 con lista vuota quando q contiene solo caratteri speciali FTS', async () => {
      mockAuthOk()
      // q="^^" → length=2 passa validazione, ma buildFtsQuery lancia EMPTY_QUERY
      const res = await app.request(
        '/api/search?q=%5E%5E',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
      const data = await res.json() as { items: unknown[]; nextCursor: unknown; total: number }
      expect(data.items).toHaveLength(0)
      expect(data.nextCursor).toBeNull()
      expect(data.total).toBe(0)
    })
  })

  describe('happy path — nessun risultato', () => {
    it('restituisce 200 con items vuota quando FTS non trova nulla', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=qualcosa',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
      const data = await res.json() as { items: unknown[]; nextCursor: unknown; total: number }
      expect(data.items).toHaveLength(0)
      expect(data.nextCursor).toBeNull()
      expect(data.total).toBe(0)
    })
  })

  describe('happy path — risultati presenti', () => {
    const ftsRow: FtsRow = {
      entry_id: 'e1',
      schema_slug: 'articoli',
      title: 'Guida a Beech',
      body: 'testo',
      tags: '',
      status: 'published',
      excerpt: '<mark>Guida</mark> a Beech',
      rank: -1.5,
    }
    const fullRow: FullRow = { id: 'e1', slug: 'guida-beech', data: '{"br_01":"Guida a Beech"}' }

    it('restituisce 200 con items e nextCursor null quando non ci sono altre pagine', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=Guida&limit=5',
        { method: 'GET', headers: authHeader() },
        {
          DB: createSearchMockD1({ ftsRows: [ftsRow], total: 1, fullRows: [fullRow] }),
          JWT_SECRET,
        },
      )
      expect(res.status).toBe(200)
      const data = await res.json() as { items: unknown[]; nextCursor: unknown; total: number }
      expect(data.items).toHaveLength(1)
      expect(data.nextCursor).toBeNull()
      expect(data.total).toBe(1)
    })

    it('restituisce nextCursor quando ci sono più pagine (rows > limit)', async () => {
      mockAuthOk()
      // Con limit=1, fetchando 2 righe (limit+1) indica hasMore
      const ftsRow2: FtsRow = { ...ftsRow, entry_id: 'e2', rank: -1.2 }
      const fullRow2: FullRow = { id: 'e2', slug: 'secondo', data: '{}' }
      const res = await app.request(
        '/api/search?q=Guida&limit=1',
        { method: 'GET', headers: authHeader() },
        {
          DB: createSearchMockD1({
            ftsRows: [ftsRow, ftsRow2],
            total: 5,
            fullRows: [fullRow, fullRow2],
          }),
          JWT_SECRET,
        },
      )
      expect(res.status).toBe(200)
      const data = await res.json() as { items: unknown[]; nextCursor: string | null; total: number }
      expect(data.items).toHaveLength(1)
      expect(data.nextCursor).not.toBeNull()
      expect(typeof data.nextCursor).toBe('string')
      expect(data.total).toBe(5)
    })

    it('filtra le righe FTS la cui entry non esiste in content_entries', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=Guida',
        { method: 'GET', headers: authHeader() },
        {
          // FTS trova una riga, ma content_entries non la restituisce (es. cancellata)
          DB: createSearchMockD1({ ftsRows: [ftsRow], total: 1, fullRows: [] }),
          JWT_SECRET,
        },
      )
      expect(res.status).toBe(200)
      const data = await res.json() as { items: unknown[] }
      expect(data.items).toHaveLength(0)
    })

    it('applica il clamp limit tra 1 e 50', async () => {
      mockAuthOk()
      // limit=999 → clampato a 50 → il mock riceve comunque la chiamata correttamente
      const res = await app.request(
        '/api/search?q=test&limit=999',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
    })

    it('accetta il filtro schema_slug', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=test&schema_slug=articoli',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
    })

    it('accetta il filtro status', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=test&status=published',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
    })

    it('accetta il parametro cursor per la paginazione', async () => {
      mockAuthOk()
      // cursor valido = base64 di "rank:entryId"
      const cursor = btoa('-1.5:e0')
      const res = await app.request(
        `/api/search?q=test&cursor=${encodeURIComponent(cursor)}`,
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0, fullRows: [] }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
    })
  })
})
