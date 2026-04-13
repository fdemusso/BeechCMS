/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function createMockD1ForPublicAdd(options?: {
  slugExists?: boolean
  shouldFailInsert?: boolean
  idempotencyRecord?: Record<string, unknown> | null
  captureIdempotencyInsert?: (args: unknown[]) => void
}) {
  const slugExists = options?.slugExists ?? false
  const shouldFailInsert = options?.shouldFailInsert ?? false
  const idempotencyRecord = options?.idempotencyRecord ?? null
  const captureIdempotencyInsert = options?.captureIdempotencyInsert

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => {
        if (sql.includes('FROM public_idempotency_keys')) {
          return {
            first: vi.fn(async () => idempotencyRecord),
          }
        }
        if (sql.includes('INSERT INTO public_idempotency_keys')) {
          return {
            run: vi.fn(async (...args: unknown[]) => {
              captureIdempotencyInsert?.(args)
              return { success: true, meta: { changes: 1 } }
            }),
          }
        }
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
    PUBLIC_WRITE_API_KEY: 'valid-key',
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
    const res = await app.request('/api/v1/public/messaggi/add', {
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
    expect(body.detail).toBe('Invalid JSON body')
  })

  it("POST senza data valida -> 400", async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
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
    expect(body.detail).toBe("Field 'data' is required and must be a non-empty object")
  })

  it('POST con status invalido -> 400', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'archived', data: { name: 'x' } }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
  })

  it('POST con errore validazione tipo -> 400 con details', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { read: 'not-a-boolean' },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.detail).toBe('Validation failed')
    expect(Array.isArray(body.errors)).toBe(true)
    expect(body.type).toBe('https://beechcms.dev/problems/validation_failed')
  })

  it('POST con richtext pericoloso -> 422', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { message: '<p>ok</p><script>alert(1)</script>' },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(422)
  })

  it('POST con slug gia esistente -> 409', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slug: 'primo-articolo',
        data: {
          name: 'Titolo',
          email: 'mario@example.com',
          subject: 'Contatto',
          message: '<p>Messaggio</p>',
        },
      }),
    }, {
      DB: createMockD1ForPublicAdd({ slugExists: true }),
      ...envBase,
    })

    expect(res.status).toBe(409)
  })

  it('POST successo con slug auto-generato -> 201', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'draft',
        data: {
          name: 'Titolo Nuovo Articolo',
          email: 'mario@example.com',
          subject: 'Nuovo articolo',
          message: '<p>Messaggio</p>',
        },
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

  it('POST su seed non abilitato pubblicamente -> 403', async () => {
    const res = await app.request('/api/v1/public/articoli/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { title: 'Titolo Nuovo Articolo' },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(403)
  })

  it('POST con Idempotency-Key e payload diverso -> 409', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Idempotency-Key': 'idem-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          name: 'Titolo Nuovo Articolo',
          email: 'mario@example.com',
          subject: 'Nuovo articolo',
          message: '<p>Messaggio</p>',
        },
      }),
    }, {
      DB: createMockD1ForPublicAdd({
        idempotencyRecord: {
          idempotency_key: 'idem-1',
          request_fingerprint: 'old-fingerprint',
          response_status: 201,
          response_body: JSON.stringify({ success: true, id: 'old', slug: 'old' }),
          expires_at: 9999999999,
        },
      }),
      ...envBase,
    })

    expect(res.status).toBe(409)
  })

  it('POST con alias sconosciuto -> 400', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          name: 'Mario',
          unknownField: 'x',
        },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.detail).toBe('Validation failed')
    expect(Array.isArray(body.errors)).toBe(true)
    expect(JSON.stringify(body.errors)).toContain('unknownField')
  })

  it('POST con soli alias sconosciuti -> 400', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          unknownField: 'x',
        },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.detail).toBe('Validation failed')
    expect(JSON.stringify(body.errors)).toContain('at-least-one-valid-field')
  })

  it('POST senza required field del seed -> 400', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          email: 'mario@example.com',
          message: '<p>Ciao</p>',
          subject: 'Info',
        },
      }),
    }, {
      DB: createMockD1ForPublicAdd(),
      ...envBase,
    })

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.detail).toBe('Validation failed')
    expect(JSON.stringify(body.errors)).toContain("'name' is required")
  })
})

