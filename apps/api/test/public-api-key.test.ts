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
  it('restituisce 403 quando le key pubbliche non sono configurate', async () => {
    const res = await app.request('/api/v1/public/health', { method: 'GET' }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      ENV: 'development',
    })

    expect(res.status).toBe(403)
    const body = asObject(await res.json())
    expect(body.title).toBe('Forbidden')
    expect(body.detail).toBe('Public API access is not configured for this instance.')
    expect(body.type).toBe('https://beechcms.dev/problems/public-api-not-configured')
  })

  it('restituisce 401 quando la key e mancante', async () => {
    const res = await app.request('/api/v1/public/health', { method: 'GET' }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-read-key',
      ENV: 'development',
    })

    expect(res.status).toBe(401)
    const body = asObject(await res.json())
    expect(body.title).toBe('Unauthorized')
    expect(body.detail).toEqual(expect.stringContaining('Missing or invalid API key'))
    expect(body.type).toBe('https://beechcms.dev/problems/public-api-key-unauthorized')
  })

  it('usa X-API-Key per accesso GET', async () => {
    const res = await app.request('/api/v1/public/health', {
      method: 'GET',
      headers: {
        'X-API-Key': 'valid-read-key',
      },
    }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-read-key',
      ENV: 'development',
    })

    expect(res.status).toBe(200)
    const body = asObject(await res.json())
    expect(body.ok).toBe(true)
    expect(body.service).toBe('public-api')
  })

  it('rifiuta key in query param anche se valida', async () => {
    const res = await app.request('/api/v1/public/health?key=valid-read-key', { method: 'GET' }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-read-key',
      ENV: 'development',
    })

    expect(res.status).toBe(401)
  })

  it('usa key write dedicata per POST', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-write-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          name: 'Mario',
          email: 'mario@example.com',
          subject: 'Ciao',
          message: '<p>Messaggio</p>',
        },
      }),
    }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-read-key',
      PUBLIC_WRITE_API_KEY: 'valid-write-key',
      ENV: 'development',
    })

    expect([200, 201]).toContain(res.status)
  })

  it('rifiuta key read su POST', async () => {
    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'valid-read-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          name: 'Mario',
          email: 'mario@example.com',
          subject: 'Ciao',
          message: '<p>Messaggio</p>',
        },
      }),
    }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'valid-read-key',
      PUBLIC_WRITE_API_KEY: 'valid-write-key',
      ENV: 'development',
    })

    expect(res.status).toBe(401)
  })
})

