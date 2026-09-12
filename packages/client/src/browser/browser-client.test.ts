// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { createBeechBrowserClient, createBeechClient } from './index.js'
import type { BeechClientConfig } from '../types.js'

function mockFetch(status: number, body: unknown, contentType = 'application/json', statusText = 'OK') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers({ 'Content-Type': contentType }),
    json: async () => body,
  } as unknown as Response)
}

const baseConfig: BeechClientConfig = {
  baseUrl: 'https://api.example.com/',
  apiKey: 'test-key',
}

describe('Browser Client (@beechcms/client/browser)', () => {
  it('throws error on missing or invalid configuration', () => {
    expect(() => createBeechBrowserClient(null as unknown as BeechClientConfig)).toThrow(TypeError)
    expect(() => createBeechBrowserClient({ baseUrl: '', apiKey: 'key' })).toThrow(/baseUrl is required/)
    expect(() => createBeechBrowserClient({ baseUrl: 'https://api.example.com', apiKey: '' })).toThrow(/apiKey is required/)
  })

  it('normalizes trailing slashes on baseUrl', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { total: 0, returned: 0, seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, baseUrl: 'https://api.example.com///', fetch: fetchMock })
    await client.collection('posts').list()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('list sends GET request with X-API-Key and search params', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: '1', title: 'A' }], meta: { total: 1, returned: 1, seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ title: 'hello' }).select(['id']).list()
    expect(res.error).toBeNull()
    expect(res.data?.data).toHaveLength(1)
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('filter=')
    expect(calledUrl).toContain('fields=id')
  })

  it('get by id is performed using where and first, sending GET request with ?filter=...', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: 'p_123', title: 'Post' }], meta: { seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ id: 'p_123' }).first()
    expect(res.error).toBeNull()
    expect(res.data?.data.id).toBe('p_123')
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('filter=')
    expect(calledUrl).toContain('limit=1')
  })

  it('get by slug is performed using where and first, sending GET request with ?filter=...', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: 'p_123', slug: 'my-slug' }], meta: { seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ slug: 'my-slug' }).first()
    expect(res.error).toBeNull()
    expect(res.data?.data.slug).toBe('my-slug')
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('filter=')
    expect(calledUrl).toContain('limit=1')
  })

  it('first() returns a 404 BeechProblem when the list comes back empty', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ id: 'missing' }).first()
    expect(res.data).toBeNull()
    expect(res.error).toEqual(expect.objectContaining({ status: 404, type: 'not_found' }))
  })

  it('list forwards the validate option without altering the response', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: '1' }], meta: { total: 1, returned: 1, seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').list({ validate: true })
    expect(res.error).toBeNull()
    expect(res.data?.data).toHaveLength(1)
  })

  it('does NOT expose mutation methods (create, update)', () => {
    const client = createBeechBrowserClient(baseConfig)
    const resource = client.collection('posts') as unknown as Record<string, unknown>
    expect(resource.create).toBeUndefined()
    expect(resource.update).toBeUndefined()
  })

  it('returns normalized RFC 9457 error on 4xx/5xx HTTP failure without throwing', async () => {
    const problem = {
      type: 'https://api.beechcms.com/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'Resource does not exist',
    }
    const fetchMock = mockFetch(404, problem, 'application/problem+json', 'Not Found')
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ id: 'missing' }).first()
    expect(res.data).toBeNull()
    expect(res.error).toEqual(expect.objectContaining({ status: 404, detail: 'Resource does not exist' }))
  })

  it('encapsulates network errors with status: 0 without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').list()
    expect(res.data).toBeNull()
    expect(res.error).toEqual(expect.objectContaining({ status: 0, detail: 'Failed to fetch' }))
  })

  it('alias createBeechClient works identically to createBeechBrowserClient', () => {
    expect(createBeechClient).toBe(createBeechBrowserClient)
  })
})

describe('createBeechBrowserClient — schema fingerprint drift', () => {
  it('returns a 409 BeechProblem when X-Schema-Revision header does not match expected fingerprint', async () => {
    vi.resetModules()
    vi.doMock('../types.js', async () => {
      const actual = await vi.importActual<typeof import('../types.js')>('../types.js')
      return { ...actual, SCHEMA_FINGERPRINT: 'v1.expected' }
    })

    // Re-import after mocking types.js so the client sees the stubbed fingerprint.
    const { createBeechBrowserClient: createClientMocked } = await import('./client.js')

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json',
        'X-Schema-Revision': 'v1.stale',
      }),
      json: async () => ({ data: [], meta: { seed: 'posts' } }),
    })
    const client = createClientMocked({ ...baseConfig, fetch: fetchMock })

    const res = await client.collection('posts').list()

    expect(res.error).not.toBeNull()
    expect(res.error?.status).toBe(409)
    expect(res.error?.type).toBe('schema_drift')
  })

  it('passes normally when X-Schema-Revision matches or is absent', async () => {
    vi.resetModules()
    vi.doMock('../types.js', async () => {
      const actual = await vi.importActual<typeof import('../types.js')>('../types.js')
      return { ...actual, SCHEMA_FINGERPRINT: 'v1.expected' }
    })

    const { createBeechBrowserClient: createClientMocked } = await import('./client.js')

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json',
        'X-Schema-Revision': 'v1.expected',
      }),
      json: async () => ({ data: [], meta: { seed: 'posts' } }),
    })
    const client = createClientMocked({ ...baseConfig, fetch: fetchMock })

    const res = await client.collection('posts').list()

    expect(res.error).toBeNull()
    expect(res.data).toBeDefined()
  })
})
