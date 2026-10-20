// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { request, validateClientConfig } from './http.js'
import type { BeechClientConfig } from './types.js'

const baseConfig: BeechClientConfig = {
  baseUrl: 'https://api.example.com',
  apiKey: 'test-key',
}

describe('validateClientConfig', () => {
  it('accepts a well-formed config', () => {
    expect(() => validateClientConfig(baseConfig)).not.toThrow()
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
