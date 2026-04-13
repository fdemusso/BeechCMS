/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function createMockD1ForPublicRead(options?: {
  listRows?: Array<Record<string, unknown>>
  detailRow?: Record<string, unknown> | null
  total?: number
}) {
  const listRows = options?.listRows ?? []
  const detailRow = options?.detailRow ?? null
  const total = options?.total ?? listRows.length

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => {
        if (sql.includes('COUNT(*)')) {
          return {
            first: vi.fn(async () => ({ total })),
          }
        }
        if (sql.includes('FROM content_entries') && sql.includes('id = ?')) {
          const enforcePublished = sql.includes("status = 'published'")
          return {
            first: vi.fn(async () => {
              if (!enforcePublished) return detailRow
              const row = asObject(detailRow)
              return row.status === 'published' ? detailRow : null
            }),
          }
        }
        return {
          all: vi.fn(async () => ({ results: listRows })),
        }
      }),
    })),
  }
}

describe('Public API read endpoint', () => {
  it('GET /api/v1/public/:seed con seed inesistente restituisce 404', async () => {
    const res = await app.request('/api/v1/public/invalidtype', {
      method: 'GET',
      headers: { 'X-API-Key': 'valid-key' },
    }, {
      DB: createMockD1ForPublicRead(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-key',
      ENV: 'development',
    })

    expect(res.status).toBe(404)
    const body = asObject(await res.json())
    expect(body.title).toBe('Seed Not Found')
    expect(body.detail).toEqual(expect.stringContaining("The content type 'invalidtype' does not exist"))
  })

  it('GET /api/v1/public/articoli?id=uuid restituisce singola entry flat', async () => {
    const mockDB = createMockD1ForPublicRead({
      detailRow: {
        id: 'uuid-1',
        schema_slug: 'articoli',
        slug: 'primo-articolo',
        status: 'published',
        data: JSON.stringify({ art_01: 'Titolo uno', art_02: '2026-04-07' }),
        created_at: 1700000001,
        updated_at: 1700000001,
      },
    })

    const res = await app.request('/api/v1/public/articoli?id=uuid-1', {
      method: 'GET',
      headers: { 'X-API-Key': 'valid-key' },
    }, {
      DB: mockDB,
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-key',
      ENV: 'development',
    })

    expect(res.status).toBe(200)
    const body = asObject(await res.json())
    const data = asObject(body.data)
    const meta = asObject(body.meta)
    expect(meta.seed).toBe('articoli')
    expect(data.id).toBe('uuid-1')
    expect(data.title).toBe('Titolo uno')
    expect(data.publishedAt).toBe('2026-04-07')
  })

  it('GET lista con fields applica projection + metadata obbligatori', async () => {
    const mockDB = createMockD1ForPublicRead({
      listRows: [
        {
          id: 'uuid-1',
          schema_slug: 'articoli',
          slug: 'primo-articolo',
          status: 'published',
          data: JSON.stringify({ art_01: 'Titolo uno', art_02: '2026-04-07', art_06: 'Meta' }),
          created_at: 1700000001,
          updated_at: 1700000001,
        },
      ],
      total: 1,
    })

    const res = await app.request(
      '/api/v1/public/articoli?fields=title,publishedAt&page=1&limit=25',
      {
        method: 'GET',
        headers: { 'X-API-Key': 'valid-key' },
      },
      {
        DB: mockDB,
        JWT_SECRET: 'test-secret',
        PUBLIC_READ_API_KEY: 'valid-key',
        ENV: 'development',
      }
    )

    expect(res.status).toBe(200)
    const body = asObject(await res.json())
    const dataList = Array.isArray(body.data) ? body.data : []
    const first = asObject(dataList[0])
    const meta = asObject(body.meta)
    expect(dataList).toHaveLength(1)
    expect(first.id).toBe('uuid-1')
    expect(first.title).toBe('Titolo uno')
    expect(first.publishedAt).toBe('2026-04-07')
    expect(first.metaTitle).toBeUndefined()
    expect(meta.seed).toBe('articoli')
    expect(meta.returned).toBe(1)
  })

  it('GET con latest restituisce meta {total, returned, seed}', async () => {
    const mockDB = createMockD1ForPublicRead({
      listRows: [
        {
          id: 'uuid-1',
          schema_slug: 'articoli',
          slug: 'art-1',
          status: 'published',
          data: JSON.stringify({ art_01: 'Titolo 1' }),
          created_at: 1700000001,
          updated_at: 1700000001,
        },
      ],
      total: 10,
    })

    const res = await app.request('/api/v1/public/articoli?latest=3', {
      method: 'GET',
      headers: { 'X-API-Key': 'valid-key' },
    }, {
      DB: mockDB,
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-key',
      ENV: 'development',
    })

    expect(res.status).toBe(200)
    const body = asObject(await res.json())
    const meta = asObject(body.meta)
    expect(meta.total).toBe(10)
    expect(meta.returned).toBe(1)
    expect(meta.seed).toBe('articoli')
  })

  it('GET con filter malformato restituisce 400', async () => {
    const res = await app.request('/api/v1/public/articoli?filter=%7Bbad-json', {
      method: 'GET',
      headers: { 'X-API-Key': 'valid-key' },
    }, {
      DB: createMockD1ForPublicRead(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-key',
      ENV: 'development',
    })

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.title).toBe('Bad Request')
    expect(body.detail).toEqual(expect.stringContaining('Invalid filter'))
  })

  it('GET su seed non esposto in lettura pubblica restituisce 403', async () => {
    const res = await app.request('/api/v1/public/messaggi', {
      method: 'GET',
      headers: { 'X-API-Key': 'valid-key' },
    }, {
      DB: createMockD1ForPublicRead(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-key',
      ENV: 'development',
    })

    expect(res.status).toBe(403)
  })

  it('GET per id non restituisce bozze quando PUBLIC_PUBLISHED_ONLY=true', async () => {
    const mockDB = createMockD1ForPublicRead({
      detailRow: {
        id: 'uuid-draft',
        schema_slug: 'articoli',
        slug: 'bozza',
        status: 'draft',
        data: JSON.stringify({ art_01: 'Bozza' }),
        created_at: 1700000001,
        updated_at: 1700000001,
      },
    })

    const res = await app.request('/api/v1/public/articoli?id=uuid-draft', {
      method: 'GET',
      headers: { 'X-API-Key': 'valid-key' },
    }, {
      DB: mockDB,
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-key',
      PUBLIC_PUBLISHED_ONLY: 'true',
      ENV: 'development',
    })

    expect(res.status).toBe(404)
  })
})

