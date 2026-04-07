/// <reference types="@cloudflare/workers-types" />
import { dbToApi, getSeed } from '@beech/core'
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
        if (
          sql.includes(
            'SELECT id, schema_slug, slug, status, data, created_at, updated_at FROM content_entries WHERE schema_slug = ? AND id = ? LIMIT 1'
          )
        ) {
          return {
            first: vi.fn(async () => currentRow),
          }
        }

        if (sql.includes('SELECT id FROM content_entries WHERE schema_slug = ? AND slug = ? AND id != ?')) {
          return {
            first: vi.fn(async () => (slugConflict ? { id: 'existing-id' } : null)),
          }
        }

        if (sql.includes('UPDATE content_entries')) {
          return {
            run: vi.fn(async () => {
              captureUpdateBind?.(args)
              if (shouldFailUpdate) throw new Error('Update failed')
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

describe('Public API edit endpoint', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000'
  const envBase = {
    JWT_SECRET: 'test-secret',
    PUBLIC_API_KEY: 'valid-key',
    ENV: 'development',
  }

  it('PUT con UUID non valido -> 400', async () => {
    const res = await app.request(
      '/api/v1/public/articoli/edit/not-a-uuid',
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
    expect(body.message).toBe('Invalid entry ID format')
  })

  it('PUT con entry assente -> 404', async () => {
    const res = await app.request(
      `/api/v1/public/articoli/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { title: 'Nuovo titolo' } }),
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
    const currentRow = {
      id: validId,
      schema_slug: 'articoli',
      slug: 'articolo-esistente',
      status: 'draft',
      data: JSON.stringify({
        art_01: 'Titolo attuale',
        art_05: '<p>Body invariato</p>',
        art_06: 'Meta da rimuovere',
      }),
      created_at: 1700000001,
      updated_at: 1700000002,
    }

    const res = await app.request(
      `/api/v1/public/articoli/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: 'Articolo Aggiornato',
          status: 'published',
          data: {
            title: 'Titolo aggiornato',
            metaTitle: null,
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
    expect(body.slug).toBe('articolo-aggiornato')

    const seed = getSeed('articoli')
    if (!seed) throw new Error('Seed articoli non trovato')
    const boundData = bindArgs[2]
    const savedDbData = JSON.parse(
      typeof boundData === 'string' ? boundData : JSON.stringify(boundData)
    ) as Record<string, unknown>
    const savedAliasData = dbToApi(seed, savedDbData)
    expect(savedAliasData.title).toBe('Titolo aggiornato')
    expect(savedAliasData.body).toBe('<p>Body invariato</p>')
    expect(savedAliasData.metaTitle).toBeUndefined()
    expect(bindArgs[0]).toBe('articolo-aggiornato')
    expect(bindArgs[1]).toBe('published')
  })

  it('PUT con slug in conflitto -> 409', async () => {
    const res = await app.request(
      `/api/v1/public/articoli/edit/${validId}`,
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
            schema_slug: 'articoli',
            slug: 'old-slug',
            status: 'draft',
            data: JSON.stringify({ art_01: 'Titolo' }),
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
      `/api/v1/public/prodotti/edit/${validId}`,
      {
        method: 'PUT',
        headers: {
          'X-API-Key': 'valid-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            price: 'not-a-number',
          },
        }),
      },
      {
        DB: createMockD1ForPublicEdit({
          currentRow: {
            id: validId,
            schema_slug: 'prodotti',
            slug: 'prodotto-1',
            status: 'draft',
            data: JSON.stringify({ prod_01: 'Prodotto' }),
            created_at: 1700000001,
            updated_at: 1700000002,
          },
        }),
        ...envBase,
      }
    )

    expect(res.status).toBe(400)
    const body = asObject(await res.json())
    expect(body.message).toBe('Validation failed')
    expect(Array.isArray(body.details)).toBe(true)
  })
})
