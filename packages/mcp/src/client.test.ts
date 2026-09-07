// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

async function freshClient() {
  vi.resetModules()
  return import('./client.js')
}

describe('client', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.BEECH_EMAIL = 'admin@example.com'
    process.env.BEECH_PASSWORD = 'secret'
    process.env.BEECH_API_URL = 'http://localhost:8787'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('surfaces the offline diagnostic when the backend is unreachable on first login', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const { request, BeechClientError } = await freshClient()

    await expect(request('GET', '/api/seeds')).rejects.toThrow(BeechClientError)
    await expect(request('GET', '/api/seeds')).rejects.toThrow(
      'Cannot reach the BeechCMS API at http://localhost:8787. Start the local stack with: pnpm beech dev'
    )
  })

  it('surfaces the offline diagnostic on ECONNREFUSED too', async () => {
    const econnrefused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    globalThis.fetch = vi.fn().mockRejectedValue(econnrefused)
    const { request } = await freshClient()

    await expect(request('GET', '/api/seeds')).rejects.toThrow(
      'Cannot reach the BeechCMS API at http://localhost:8787. Start the local stack with: pnpm beech dev'
    )
  })

  it('logs in then performs the request on the happy path', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'tok', expiresIn: '1h' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { request } = await freshClient()

    const result = await request<{ ok: boolean }>('GET', '/api/seeds')
    expect(result.data).toEqual({ ok: true })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects with a clear error when credentials are missing', async () => {
    delete process.env.BEECH_EMAIL
    delete process.env.BEECH_PASSWORD
    const { request, BeechClientError } = await freshClient()

    await expect(request('GET', '/api/seeds')).rejects.toThrow(BeechClientError)
    await expect(request('GET', '/api/seeds')).rejects.toThrow('Missing BEECH_EMAIL / BEECH_PASSWORD')
  })
})
