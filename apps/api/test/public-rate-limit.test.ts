/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'

function createMockD1() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
      })),
    })),
  }
}

describe('Public API rate limiting', () => {
  it('GET /public ritorna 429 quando read limiter blocca', async () => {
    const limiter = {
      limit: vi.fn(async () => ({ success: false })),
    }

    const res = await app.request('/api/v1/public/articoli', {
      method: 'GET',
      headers: { 'X-API-Key': 'read-key' },
    }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_READ_API_KEY: 'read-key',
      PUBLIC_READ_RATE_LIMITER: limiter as unknown as RateLimit,
      ENV: 'development',
    })

    expect(res.status).toBe(429)
  })

  it('POST /public ritorna 429 quando write limiter blocca', async () => {
    const limiter = {
      limit: vi.fn(async () => ({ success: false })),
    }

    const res = await app.request('/api/v1/public/messaggi/add', {
      method: 'POST',
      headers: {
        'X-API-Key': 'write-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { name: 'Mario', email: 'mario@example.com', subject: 'ciao', message: '<p>ok</p>' },
      }),
    }, {
      DB: createMockD1(),
      JWT_SECRET: 'test-secret',
      PUBLIC_WRITE_API_KEY: 'write-key',
      PUBLIC_WRITE_RATE_LIMITER: limiter as unknown as RateLimit,
      ENV: 'development',
    })

    expect(res.status).toBe(429)
  })
})
