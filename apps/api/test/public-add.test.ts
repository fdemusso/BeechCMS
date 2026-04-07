/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function createMockD1ForPublicAdd(options?: {
  slugExists?: boolean
  shouldFailInsert?: boolean
}) {
  const slugExists = options?.slugExists ?? false
  const shouldFailInsert = options?.shouldFailInsert ?? false

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => {
        if (sql.includes('SELECT id FROM content_entries WHERE schema_slug = ? AND slug = ?')) {
          return {
            first: vi.fn(async () => (slugExists ? { id: 'existing-id' } : null)),
          }
        }
        if (sql.includes('INSERT INTO content_entries')) {
          return {
            run: vi.fn(async () => {
              if (shouldFailInsert) throw new Error('Insert failed')
              return { success: true, meta: { changes: 1 } }
            }),
          }
        }
        return {
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
        }
      }),
    })),
  }
}

describe('Public API add endpoint', () => {
  const envBase = {
    JWT_SECRET: 'test-secret',
    PUBLIC_API_KEY: 'valid-key',
    ENV: 'development',
  }

  it('POST /api/v1/public/:seed/add con seed inesistente -> 404', async () => {
    const res = await app.request('/api/v1/public/invalidtype/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { title: 'x' } }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(404)
  })

  it('POST con JSON malformato -> 400', async () => {
    const res = await app.request('/api/v1/public/articoli/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: '{"data":',
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.message).toBe('Invalid JSON body')
  })

  it("POST senza data valida -> 400", async () => {
    const res = await app.request('/api/v1/public/articoli/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: {} }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.message).toBe("Field 'data' is required and must be a non-empty object")
  })

  it('POST con status invalido -> 400', async () => {
    const res = await app.request('/api/v1/public/articoli/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'archived', data: { title: 'x' } }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
  })

  it('POST con errore validazione tipo -> 400 con details', async () => {
    const res = await app.request('/api/v1/public/prodotti/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { price: 'not-a-number' },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.message).toBe('Validation failed')
    expect(Array.isArray(body.details)).toBe(true)
  })

  it('POST con richtext pericoloso -> 422', async () => {
    const res = await app.request('/api/v1/public/articoli/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { body: '<p>ok</p><script>alert(1)</script>' },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(422)
  })

  it('POST con slug gia esistente -> 409', async () => {
    const res = await app.request('/api/v1/public/articoli/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slug: 'primo-articolo',
        data: { title: 'Titolo' },
      }),
    }, {
      DB: createMockD1ForPublicAdd({ slugExists: true }),
      ...envBase,
    })

    expect(res.status).toBe(409)
  })

  it('POST successo con slug auto-generato -> 201', async () => {
    const res = await app.request('/api/v1/public/articoli/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'draft',
        data: { title: 'Titolo Nuovo Articolo' },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(201)
    const body = asObject(await res.json())
    expect(body.success).toBe(true)
    expect(typeof body.id).toBe('string')
    expect(body.slug).toBe('titolo-nuovo-articolo')
  })
})

