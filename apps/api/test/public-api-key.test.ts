/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect } from 'vitest'
import app from '../src/index'

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function createMockD1() {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: { changes: 0 } }),
      }),
    }),
  }
}

describe('Public API key middleware', () => {
  it('restituisce 403 quando PUBLIC_API_KEY non e configurata', async () => {
    const res = await app.request('/api/v1/public/health', { method: 'GET' }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      ENV: 'development',
    })

    expect(res.status).toBe(403)
    const body = asObject(await res.json())
    expect(body.error).toBe('Forbidden')
    expect(body.message).toBe('Public API access is not configured for this instance.')
  })

  it('restituisce 401 quando la key e mancante', async () => {
    const res = await app.request('/api/v1/public/health', { method: 'GET' }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_API_KEY: 'valid-key',
      ENV: 'development',
    })

    expect(res.status).toBe(401)
    const body = asObject(await res.json())
    expect(body.error).toBe('Unauthorized')
    expect(body.message).toEqual(expect.stringContaining('Missing or invalid API key'))
  })

  it('usa X-API-Key con priorita su query param key', async () => {
    const res = await app.request('/api/v1/public/health?key=wrong-key', {
      method: 'GET',
      headers: {
        'X-API-Key': 'valid-key',
      },
    }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_API_KEY: 'valid-key',
      ENV: 'development',
    })

    expect(res.status).toBe(200)
    const body = asObject(await res.json())
    expect(body.ok).toBe(true)
    expect(body.service).toBe('public-api')
  })

  it('accetta key da query param quando header assente', async () => {
    const res = await app.request('/api/v1/public/health?key=valid-key', { method: 'GET' }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_API_KEY: 'valid-key',
      ENV: 'development',
    })

    expect(res.status).toBe(200)
  })
})

