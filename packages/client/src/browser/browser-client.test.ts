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
    await client.content('posts').list()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('list sends GET request with X-API-Key and search params', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: '1', title: 'A' }], meta: { total: 1, returned: 1, seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').list({ search: 'hello', limit: 10 })
    expect(res.error).toBeNull()
    expect(res.data?.data).toHaveLength(1)
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('search=hello')
    expect(calledUrl).toContain('limit=10')
  })

  it('get by id sends GET request with ?id=...', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'p_123', title: 'Post' }, meta: { seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').get({ id: 'p_123' })
    expect(res.error).toBeNull()
    expect(res.data?.data.id).toBe('p_123')
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('id=p_123')
  })

  it('get by slug sends GET request with ?slug=...', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'p_123', slug: 'my-slug' }, meta: { seed: 'posts' } })
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').get({ slug: 'my-slug' })
    expect(res.error).toBeNull()
    expect(res.data?.data.slug).toBe('my-slug')
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('slug=my-slug')
  })

  it('does NOT expose mutation methods (create, update)', () => {
    const client = createBeechBrowserClient(baseConfig)
    const resource = client.content('posts') as unknown as Record<string, unknown>
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
    const res = await client.content('posts').get({ id: 'missing' })
    expect(res.data).toBeNull()
    expect(res.error).toEqual(problem)
  })

  it('encapsulates network errors with status: 0 without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = createBeechBrowserClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('posts').list()
    expect(res.data).toBeNull()
    expect(res.error).toEqual({
      type: 'about:blank',
      title: 'Network Error',
      status: 0,
      detail: 'Failed to fetch',
    })
  })

  it('alias createBeechClient works identically to createBeechBrowserClient', () => {
    expect(createBeechClient).toBe(createBeechBrowserClient)
  })
})
