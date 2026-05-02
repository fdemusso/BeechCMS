/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function createMockD1ForPublicEdit(options?: {
  currentRow?: Record<string, unknown> | null
  slugConflict?: boolean
  shouldFailUpdate?: boolean
  captureUpdateBind?: (args: unknown[]) => void
}) {
  const currentRow = options?.currentRow ?? null
  const slugConflict = options?.slugConflict ?? false
  const shouldFailUpdate = options?.shouldFailUpdate ?? false
  const captureUpdateBind = options?.captureUpdateBind

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => {
        // UPDATE must be checked before SELECT (both contain 'content_' and 'WHERE id = ?')
        if (sql.startsWith('UPDATE content_')) {
          return {
            run: vi.fn(async () => {
              captureUpdateBind?.(args)
              if (shouldFailUpdate) throw new Error('Update failed')
              return { success: true, meta: { changes: 1 } }
            }),
          }
        }

        // v0.4.0: SELECT * FROM content_{slug} WHERE id = ?
        if (sql.startsWith('SELECT') && sql.includes('WHERE id = ?') && sql.includes('content_')) {
          return { first: vi.fn(async () => currentRow) }
        }

        // v0.4.0: slug conflict check — content_{slug} WHERE slug = ? AND id != ?
        if (sql.includes('slug = ?') && sql.includes('id != ?')) {
          return { first: vi.fn(async () => (slugConflict ? { id: 'existing-id' } : null)) }
        }

        return {
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
        }
      }),
    })),
  }
}

describe('Public API edit endpoint', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000'
  const envBase = {
    JWT_SECRET: 'test-secret',
    PUBLIC_WRITE_API_KEY: 'valid-key',
    ENV: 'development',
  }

  it('PUT con UUID non valido -> 400', async () => {
    const res = await app.request(
      '/api/v1/public/messaggi/edit/not-a-uuid',
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      {
        DB: createMockD1ForPublicEdit(),
        ...envBase,
      }
    )

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.detail).toBe('Invalid entry ID format')
  })

  it('PUT con entry assente -> 404', async () => {
    const res = await app.request(
      `/api/v1/public/messaggi/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { subject: 'Nuovo titolo' } }),
      },
      {
        DB: createMockD1ForPublicEdit({ currentRow: null }),
        ...envBase,
      }
    )

    expect(res.status).toBe(404)
  })

  it('PUT applica merge parziale e cancellazione esplicita con null', async () => {
    let bindArgs: unknown[] = []
    // v0.4.0: currentRow uses real columns (not JSON blob)
    const currentRow = {
      id: validId,
      slug: 'messaggio-esistente',
      status: 'draft',
      name: 'Nome attuale',
      email: null,
      subject: 'Oggetto attuale',
      message: '<p>Body invariato</p>',
      read: null,
      created_at: 1700000001,
      updated_at: 1700000002,
    }

    const res = await app.request(
      `/api/v1/public/messaggi/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'Messaggio Aggiornato',
          status: 'published',
          data: {
            subject: 'Oggetto aggiornato',
            message: null,
          },
        }),
      },
      {
        DB: createMockD1ForPublicEdit({
          currentRow,
          captureUpdateBind: (args) => {
            bindArgs = args
          },
        }),
        ...envBase,
      }
    )

    expect(res.status).toBe(200)
    const body = asObject(await res.json())
    expect(body.success).toBe(true)
    // Nota: lo slug è limitato a 15 caratteri dal core
    expect(body.slug).toBe('messaggio-aggio')

    // v0.4.0 bind order: slug, status, updated_at, ...field bindings, id
    // Only non-null fields are included. name='Nome attuale', subject='Oggetto aggiornato'.
    // message=null was removed by removeNullishFields, so message is NOT in bindings.
    expect(bindArgs[0]).toBe('messaggio-aggio')  // slug
    expect(bindArgs[1]).toBe('published')         // status
    expect(typeof bindArgs[2]).toBe('number')     // updated_at timestamp
    expect(bindArgs).toContain('Nome attuale')    // name preserved from current
    expect(bindArgs).toContain('Oggetto aggiornato')  // subject patched
    expect(bindArgs).not.toContain('<p>Body invariato</p>')  // message removed (was null)
    expect(bindArgs[bindArgs.length - 1]).toBe(validId)  // id at end
  })

  it('PUT con slug in conflitto -> 409', async () => {
    const res = await app.request(
      `/api/v1/public/messaggi/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'slug-esistente',
        }),
      },
      {
        DB: createMockD1ForPublicEdit({
          currentRow: {
            id: validId,
            slug: 'old-slug',
            status: 'draft',
            name: 'Nome',
            email: null,
            subject: null,
            message: null,
            read: null,
            created_at: 1700000001,
            updated_at: 1700000002,
          },
          slugConflict: true,
        }),
        ...envBase,
      }
    )

    expect(res.status).toBe(409)
  })

  it('PUT con dato non valido -> 400 con details', async () => {
    const res = await app.request(
      `/api/v1/public/messaggi/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            read: 'not-a-boolean',
          },
        }),
      },
      {
        DB: createMockD1ForPublicEdit({
          currentRow: {
            id: validId,
            slug: 'messaggio-1',
            status: 'draft',
            name: 'Nome',
            created_at: 1700000001,
            updated_at: 1700000002,
          },
        }),
        ...envBase,
      }
    )

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.detail).toBe('Validation failed')
    expect(Array.isArray(body.errors)).toBe(true)
    expect(body.type).toBe('https://beechcms.dev/problems/validation_failed')
  })

  it('PUT con soli alias sconosciuti -> 400', async () => {
    const res = await app.request(
      `/api/v1/public/messaggi/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            unknownField: 'x',
          },
        }),
      },
      {
        DB: createMockD1ForPublicEdit({
          currentRow: {
            id: validId,
            slug: 'messaggio-1',
            status: 'draft',
            name: 'Nome',
            created_at: 1700000001,
            updated_at: 1700000002,
          },
        }),
        ...envBase,
      }
    )

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.detail).toBe('Validation failed')
    expect(JSON.stringify(body.errors)).toContain('unknownField')
  })

  it('PUT su seed non abilitato pubblicamente -> 403', async () => {
    const res = await app.request(
      `/api/v1/public/articoli/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { title: 'test' } }),
      },
      {
        DB: createMockD1ForPublicEdit(),
        ...envBase,
      }
    )

    expect(res.status).toBe(403)
  })
})
