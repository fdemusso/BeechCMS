// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const authorizeMock = vi.fn()
const refreshMock = vi.fn()
const readGrantMock = vi.fn()
const writeGrantMock = vi.fn()
const clearGrantMock = vi.fn()

vi.mock('./oauth.js', () => ({
  authorize: authorizeMock,
  refresh: refreshMock,
}))

vi.mock('./token-store.js', () => ({
  readGrant: readGrantMock,
  writeGrant: writeGrantMock,
  clearGrant: clearGrantMock,
}))

async function freshClient() {
  vi.resetModules()
  return import('./client.js')
}

const FRESH_GRANT = { accessToken: 'access-1', refreshToken: 'refresh-1', scope: 'schema:read schema:write', expiresAt: Date.now() + 900_000 }
const EXPIRED_GRANT = { accessToken: 'access-old', refreshToken: 'refresh-old', scope: 'schema:read schema:write', expiresAt: Date.now() - 1_000 }

describe('client', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.BEECH_API_URL = 'http://localhost:8787'
    authorizeMock.mockReset()
    refreshMock.mockReset()
    readGrantMock.mockReset()
    writeGrantMock.mockReset()
    clearGrantMock.mockReset()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('authorizes in the browser when no grant is cached, then performs the request', async () => {
    readGrantMock.mockReturnValue(undefined)
    authorizeMock.mockResolvedValue(FRESH_GRANT)
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { request } = await freshClient()

    const result = await request<{ ok: boolean }>('GET', '/api/seeds')
    expect(result.data).toEqual({ ok: true })
    expect(authorizeMock).toHaveBeenCalledTimes(1)
    expect(writeGrantMock).toHaveBeenCalledWith('http://localhost:8787', 'beech-mcp', FRESH_GRANT)
  })

  it('reuses a cached, unexpired grant without calling authorize or refresh', async () => {
    readGrantMock.mockReturnValue(FRESH_GRANT)
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { request } = await freshClient()

    await request('GET', '/api/seeds')
    expect(authorizeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8787/api/seeds',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer access-1' }) })
    )
  })

  it('refreshes an expired grant instead of re-authorizing, and the rotated refresh token overwrites the cache', async () => {
    readGrantMock.mockReturnValue(EXPIRED_GRANT)
    const rotated = { accessToken: 'access-2', refreshToken: 'refresh-2', scope: 'schema:read schema:write', expiresAt: Date.now() + 900_000 }
    refreshMock.mockResolvedValue(rotated)
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { request } = await freshClient()

    await request('GET', '/api/seeds')
    expect(refreshMock).toHaveBeenCalledWith(expect.anything(), 'refresh-old')
    expect(authorizeMock).not.toHaveBeenCalled()
    expect(writeGrantMock).toHaveBeenCalledWith('http://localhost:8787', 'beech-mcp', rotated)
  })

  it('falls back to authorize() when the cached refresh token is rejected', async () => {
    readGrantMock.mockReturnValue(EXPIRED_GRANT)
    refreshMock.mockRejectedValue(new Error('invalid_grant'))
    authorizeMock.mockResolvedValue(FRESH_GRANT)
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { request } = await freshClient()

    await request('GET', '/api/seeds')
    expect(clearGrantMock).toHaveBeenCalledWith('http://localhost:8787', 'beech-mcp')
    expect(authorizeMock).toHaveBeenCalledTimes(1)
  })

  it('on a 401, refreshes-and-retries exactly once; a second 401 throws the re-authorize message', async () => {
    readGrantMock.mockReturnValue(FRESH_GRANT)
    refreshMock.mockResolvedValue({ ...FRESH_GRANT, accessToken: 'access-3' })
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    const { request, BeechClientError } = await freshClient()

    await expect(request('GET', '/api/seeds')).rejects.toThrow(BeechClientError)
    await expect(request('GET', '/api/seeds')).rejects.toThrow('re-authorize')
    expect(refreshMock).toHaveBeenCalledTimes(2)
  })

  it('on a 403 insufficient_scope, throws the scope message and never triggers a refresh', async () => {
    readGrantMock.mockReturnValue(FRESH_GRANT)
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ error: 'insufficient_scope', error_description: "This endpoint requires the 'schema:write' scope." }), { status: 403 })
    )
    const { request, BeechClientError } = await freshClient()

    await expect(request('POST', '/api/seeds/x/mcp-apply')).rejects.toThrow(BeechClientError)
    await expect(request('POST', '/api/seeds/x/mcp-apply')).rejects.toThrow("lacks the 'schema:write' scope")
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('two concurrent requests with an empty cache trigger exactly one authorize()', async () => {
    readGrantMock.mockReturnValue(undefined)
    let resolveAuthorize: (value: typeof FRESH_GRANT) => void
    authorizeMock.mockReturnValue(new Promise(resolve => { resolveAuthorize = resolve }))
    globalThis.fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { request } = await freshClient()

    const first = request('GET', '/api/seeds')
    const second = request('GET', '/api/seeds')
    resolveAuthorize!(FRESH_GRANT)
    await Promise.all([first, second])

    expect(authorizeMock).toHaveBeenCalledTimes(1)
  })

  it('retries a transient 503 and succeeds without exhausting the retry budget', async () => {
    readGrantMock.mockReturnValue(FRESH_GRANT)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    globalThis.fetch = fetchMock
    const { request } = await freshClient()

    const result = await request<{ ok: boolean }>('GET', '/api/seeds')
    expect(result.data).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after exhausting retries on a persistent 503', async () => {
    readGrantMock.mockReturnValue(FRESH_GRANT)
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' }))
    globalThis.fetch = fetchMock
    const { request, BeechClientError } = await freshClient()

    await expect(request('GET', '/api/seeds')).rejects.toThrow(BeechClientError)
    expect(fetchMock).toHaveBeenCalledTimes(1 + 2)
  })

  it('surfaces the offline diagnostic when the backend is unreachable', async () => {
    readGrantMock.mockReturnValue(FRESH_GRANT)
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const { request, BeechClientError } = await freshClient()

    await expect(request('GET', '/api/seeds')).rejects.toThrow(BeechClientError)
    await expect(request('GET', '/api/seeds')).rejects.toThrow(
      'Cannot reach the BeechCMS API at http://localhost:8787. Start the local stack with: pnpm beech dev'
    )
  })
})
