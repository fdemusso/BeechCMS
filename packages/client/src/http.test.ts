// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { request, resolveBrowserConfig, resolveServerConfig } from './http.js'
import type { HttpConfig } from './http.js'
import type { BeechBrowserClientConfig, BeechServerClientConfig } from './types.js'

const baseConfig: HttpConfig = {
  baseUrl: 'https://api.example.com',
  key: 'test-key',
}

describe('resolveBrowserConfig', () => {
  it('returns the publishable key as the transport key', () => {
    const resolved = resolveBrowserConfig({ baseUrl: 'https://api.example.com', publishableKey: 'beech_pk_live_abc' })

    expect(resolved.key).toBe('beech_pk_live_abc')
  })

  it('throws a message naming publishableKey when given apiKey', () => {
    const legacyConfig = { baseUrl: 'https://api.example.com', apiKey: 'beech_pk_live_abc' } as unknown as BeechBrowserClientConfig

    // The message naming the replacement parameter is the migration contract.
    expect(() => resolveBrowserConfig(legacyConfig)).toThrow(/apiKey was removed: pass publishableKey to createBeechBrowserClient/)
  })

  it('throws a message naming publishableKey when the key is missing or blank', () => {
    const missing = { baseUrl: 'https://api.example.com' } as unknown as BeechBrowserClientConfig
    const blank: BeechBrowserClientConfig = { baseUrl: 'https://api.example.com', publishableKey: '  ' }

    expect(() => resolveBrowserConfig(missing)).toThrow(/publishableKey is required/)
    expect(() => resolveBrowserConfig(blank)).toThrow(/publishableKey is required/)
  })

  it('refuses a beech_sk_ key', () => {
    const secretInBrowser: BeechBrowserClientConfig = { baseUrl: 'https://api.example.com', publishableKey: 'beech_sk_live_abc' }

    expect(() => resolveBrowserConfig(secretInBrowser)).toThrow(/secret keys must never reach the browser/)
  })
})

describe('resolveServerConfig', () => {
  it('returns the secret key as the transport key', () => {
    const resolved = resolveServerConfig({ baseUrl: 'https://api.example.com', secretKey: 'beech_sk_live_abc' })

    expect(resolved.key).toBe('beech_sk_live_abc')
  })

  it('throws a message naming secretKey when given apiKey', () => {
    const legacyConfig = { baseUrl: 'https://api.example.com', apiKey: 'beech_sk_live_abc' } as unknown as BeechServerClientConfig

    expect(() => resolveServerConfig(legacyConfig)).toThrow(/apiKey was removed: pass secretKey to createBeechServerClient/)
  })

  it('throws a message naming secretKey when the key is missing', () => {
    const missing = { baseUrl: 'https://api.example.com' } as unknown as BeechServerClientConfig

    expect(() => resolveServerConfig(missing)).toThrow(/secretKey is required/)
  })
})

describe('request', () => {
  it('non-JSON content type yields null payload on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      json: async () => { throw new Error('should not be called') },
    })

    const res = await request({ ...baseConfig, fetch: fetchMock as unknown as typeof fetch }, 'GET', '/posts', {})

    expect(res.error).toBeNull()
    expect(res.data).toBeNull()
  })

  it('missing Content-Type header treats the payload as null on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
      json: async () => ({}),
    })

    const res = await request({ ...baseConfig, fetch: fetchMock as unknown as typeof fetch }, 'GET', '/posts', {})

    expect(res.data).toBeNull()
    expect(res.error).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Request failed with status 500',
    })
  })

  it('a plain-string error payload is used as the detail message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      json: async () => { throw new Error('not json') },
    })

    const res = await request({ ...baseConfig, fetch: fetchMock as unknown as typeof fetch }, 'GET', '/posts', {})

    expect(res.error?.detail).toBe('Request failed with status 400')
  })

  it('a failed json() parse on an ok response falls back to a null payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => { throw new Error('malformed') },
    })

    const res = await request({ ...baseConfig, fetch: fetchMock as unknown as typeof fetch }, 'GET', '/posts', {})

    expect(res.error).toBeNull()
    expect(res.data).toBeNull()
  })

  it('sends X-API-Key equal to cfg.key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ ok: true }),
    })

    await request({ ...baseConfig, fetch: fetchMock as unknown as typeof fetch }, 'GET', '/posts', {})

    const sentHeaders = fetchMock.mock.calls[0][1].headers as Headers
    expect(sentHeaders.get('X-API-Key')).toBe(baseConfig.key)
  })

  it('merges custom headers on top of the default API key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ ok: true }),
    })

    const res = await request({ ...baseConfig, fetch: fetchMock as unknown as typeof fetch }, 'GET', '/posts', {
      options: { headers: { 'X-Custom': 'value' } },
    })

    expect(res.error).toBeNull()
    const sentHeaders = fetchMock.mock.calls[0][1].headers as Headers
    expect(sentHeaders.get('X-Custom')).toBe('value')
    expect(sentHeaders.get('X-API-Key')).toBe('test-key')
  })
})
