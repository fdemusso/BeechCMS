// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { createBeechClient } from './client.js'
import type { BeechClientConfig } from './types.js'

function mockFetch(status: number, body: unknown, contentType = 'application/json') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (_: string) => contentType },
    json: async () => body,
  } as unknown as Response)
}

const baseConfig: BeechClientConfig = {
  baseUrl: 'https://api.example.com',
  apiKey: 'test-key',
  fetch: mockFetch(200, { data: [], meta: { total: 0, returned: 0, seed: 'posts' } }),
}

describe('createBeechClient', () => {
  it('list sends GET to correct URL with X-API-Key', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { total: 0, returned: 0, seed: 'posts' } })
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    await client.content('posts').list()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-API-Key': 'test-key' }) }),
    )
  })

  it('list with filter passes filter param', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { total: 0, returned: 0, seed: 'posts' } })
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    await client.content('posts').list({ filter: { status: 'published' } })
    const url: string = fetchMock.mock.calls[0][0]
    expect(url).toContain('filter=')
  })

  it('get by id passes id param', async () => {
    const fetchMock = mockFetch(200, { data: { id: '1' }, meta: { seed: 'posts' } })
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    await client.content('posts').get({ id: '1' })
    const url: string = fetchMock.mock.calls[0][0]
    expect(url).toContain('id=1')
  })

  it('get by slug passes slug param', async () => {
    const fetchMock = mockFetch(200, { data: { slug: 'hello' }, meta: { seed: 'posts' } })
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    await client.content('posts').get({ slug: 'hello' })
    const url: string = fetchMock.mock.calls[0][0]
    expect(url).toContain('slug=hello')
  })

  it('create sends POST with body', async () => {
    const fetchMock = mockFetch(200, { data: { id: '2' }, meta: { seed: 'posts' } })
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    await client.content('posts').create({ title: 'New Post' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts/add',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('update sends PUT to correct URL', async () => {
    const fetchMock = mockFetch(200, { data: { id: '1' }, meta: { seed: 'posts' } })
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    await client.content('posts').update('1', { title: 'Updated' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts/edit/1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('returns error on non-2xx with problem+json body', async () => {
    const problem = { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Post not found' }
    const fetchMock = mockFetch(404, problem, 'application/problem+json')
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    const result = await client.content('posts').get({ id: 'nope' })
    expect(result.data).toBeNull()
    expect(result.error?.status).toBe(404)
    expect(result.error?.title).toBe('Not Found')
  })

  it('returns error on network failure without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network failure'))
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    const result = await client.content('posts').list()
    expect(result.data).toBeNull()
    expect(result.error?.title).toBe('Network Error')
  })

  it('never throws on HTTP error', async () => {
    const fetchMock = mockFetch(500, null, 'text/plain')
    const client = createBeechClient({ ...baseConfig, fetch: fetchMock })
    await expect(client.content('posts').list()).resolves.toBeDefined()
  })
})
