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
          return { first: vi.fn(async () => ({ total })) }
        }
        // v0.4.0: detail query → SELECT * FROM content_{slug} WHERE id = ?
        if (sql.includes('content_') && sql.includes('id = ?')) {
          const enforcePublished = sql.includes("status = 'published'")
          return {
            first: vi.fn(async () => {
              if (!enforcePublished) return detailRow
              const row = asObject(detailRow)
              return row.status === 'published' ? detailRow : null
            }),
          }
        }
        return { all: vi.fn(async () => ({ results: listRows })) }
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
        slug: 'primo-articolo',
        status: 'published',
        title: 'Titolo uno',
        publishedAt: 1775520000,  // 2026-04-07 UTC as unix timestamp
        coverImage: null,
        tags: null,
        body: null,
        metaTitle: null,
        metaDescription: null,
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
    expect(String(data.publishedAt)).toContain('2026-04-07')
  })

  it('GET lista con fields applica projection + metadata obbligatori', async () => {
    const mockDB = createMockD1ForPublicRead({
      listRows: [
        {
          id: 'uuid-1',
          slug: 'primo-articolo',
          status: 'published',
          title: 'Titolo uno',
          publishedAt: 1775520000,
          metaTitle: 'Meta',
          coverImage: null,
          tags: null,
          body: null,
          metaDescription: null,
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
    expect(String(first.publishedAt)).toContain('2026-04-07')
    expect(first.metaTitle).toBeUndefined()
    expect(meta.seed).toBe('articoli')
    expect(meta.returned).toBe(1)
  })

  it('GET con latest restituisce meta {total, returned, seed}', async () => {
    const mockDB = createMockD1ForPublicRead({
      listRows: [
        {
          id: 'uuid-1',
          slug: 'art-1',
          status: 'published',
          title: 'Titolo 1',
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
        slug: 'bozza',
        status: 'draft',
        title: 'Bozza',
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

