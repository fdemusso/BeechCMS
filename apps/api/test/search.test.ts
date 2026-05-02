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

// v0.4.0: FTS row comes from JOIN of fts_{slug} + content_{slug}
type FtsRow = {
  entry_id: string
  schema_slug: string
  slug: string | null
  status: string
  title: string | null
  excerpt: string
  rank: number
}

/**
 * Mock D1 per la route /api/search (v0.4.0).
 * Due prepare() distinte:
 *  - COUNT query  → .first() { total }
 *  - FTS UNION ALL query → .all() joined FTS rows (no separate content_entries fetch)
 */
function createSearchMockD1(opts: {
  ftsRows: FtsRow[]
  total: number
}) {
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('COUNT(*)') || sql.includes('SUM(c)')) {
        return {
          bind: vi.fn(() => ({
            first: vi.fn().mockResolvedValue({ total: opts.total }),
          })),
        }
      }
      // FTS UNION ALL query
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
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
      )
      expect(res.status).toBe(401)
    })

    it('restituisce 400 quando q è assente', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
      )
      expect(res.status).toBe(400)
    })

    it('restituisce 400 quando q ha meno di 2 caratteri', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=a',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
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
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
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
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
      const data = await res.json() as { items: unknown[]; nextCursor: unknown; total: number }
      expect(data.items).toHaveLength(0)
      expect(data.nextCursor).toBeNull()
      expect(data.total).toBe(0)
    })
  })

  describe('happy path — risultati presenti', () => {
    // v0.4.0: FTS row has all needed fields from JOIN (no separate content_entries fetch)
    const ftsRow: FtsRow = {
      entry_id: 'e1',
      schema_slug: 'articoli',
      slug: 'guida-beech',
      status: 'published',
      title: 'Guida a Beech',
      excerpt: '<mark>Guida</mark> a Beech',
      rank: -1.5,
    }

    it('restituisce 200 con items e nextCursor null quando non ci sono altre pagine', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=Guida&limit=5',
        { method: 'GET', headers: authHeader() },
        {
          DB: createSearchMockD1({ ftsRows: [ftsRow], total: 1 }),
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
      const ftsRow2: FtsRow = { ...ftsRow, entry_id: 'e2', slug: 'secondo', rank: -1.2 }
      const res = await app.request(
        '/api/search?q=Guida&limit=1',
        { method: 'GET', headers: authHeader() },
        {
          DB: createSearchMockD1({ ftsRows: [ftsRow, ftsRow2], total: 5 }),
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

    it('applica il clamp limit tra 1 e 50', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=test&limit=999',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
    })

    it('accetta il filtro schema_slug', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=test&schema_slug=articoli',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
    })

    it('accetta il filtro status', async () => {
      mockAuthOk()
      const res = await app.request(
        '/api/search?q=test&status=published',
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
    })

    it('accetta il parametro cursor per la paginazione', async () => {
      mockAuthOk()
      const cursor = btoa('-1.5:e0')
      const res = await app.request(
        `/api/search?q=test&cursor=${encodeURIComponent(cursor)}`,
        { method: 'GET', headers: authHeader() },
        { DB: createSearchMockD1({ ftsRows: [], total: 0 }), JWT_SECRET },
      )
      expect(res.status).toBe(200)
    })
  })
})
