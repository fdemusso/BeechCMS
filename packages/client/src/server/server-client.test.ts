// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { createBeechServerClient, createBeechClient } from './index.js'
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
  baseUrl: 'https://api.example.com',
  apiKey: 'server-secret-key',
}

describe('Server Client (@beechcms/client/server)', () => {
  it('throws error on missing or invalid configuration', () => {
    expect(() => createBeechServerClient(null as unknown as BeechClientConfig)).toThrow(TypeError)
    expect(() => createBeechServerClient({ baseUrl: '', apiKey: 'key' })).toThrow(/baseUrl is required/)
    expect(() => createBeechServerClient({ baseUrl: 'https://api.example.com', apiKey: '' })).toThrow(/apiKey is required/)
  })

  it('create sends POST request with body to /:seed/add', async () => {
    const fetchMock = mockFetch(201, { data: { id: 'p_1', title: 'New Article' }, meta: { seed: 'articles' } })
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('articles').create({ title: 'New Article' })
    expect(res.error).toBeNull()
    expect(res.data?.data.title).toBe('New Article')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/articles/add',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: JSON.stringify({ data: { title: 'New Article' } }),
      }),
    )
  })

  it('update sends PUT request with body to /:seed/edit/:id', async () => {
    const fetchMock = mockFetch(200, { data: { id: 'p_1', title: 'Updated' }, meta: { seed: 'articles' } })
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('articles').update('p_1', { title: 'Updated' })
    expect(res.error).toBeNull()
    expect(res.data?.data.title).toBe('Updated')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/articles/edit/p_1',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.any(Headers),
        body: JSON.stringify({ data: { title: 'Updated' } }),
      }),
    )
  })

  it('create supports pre-wrapped { data: ... } without double-wrapping', async () => {
    const fetchMock = mockFetch(201, { data: { id: 'p_1', title: 'Pre-wrapped' }, meta: { seed: 'articles' } })
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    await client.content('articles').create({ data: { title: 'Pre-wrapped' } } as any)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/articles/add',
      expect.objectContaining({
        body: JSON.stringify({ data: { title: 'Pre-wrapped' } }),
      }),
    )
  })

  it('normalizes legacy response without .data wrapper safely', async () => {
    const fetchMock = mockFetch(201, { success: true, id: 'p_legacy', slug: 'legacy-entry' })
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('articles').create({ title: 'Legacy' })
    expect(res.error).toBeNull()
    expect(res.data?.data).toEqual({ success: true, id: 'p_legacy', slug: 'legacy-entry' })
    expect(res.data?.meta.seed).toBe('articles')
  })

  it('forwards custom RequestOptions (headers, signal, next tags)', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { total: 0, returned: 0, seed: 'posts' } })
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const controller = new AbortController()
    await client.content('posts').list(undefined, {
      signal: controller.signal,
      headers: { 'X-Custom-Header': 'CustomValue' },
      next: { tags: ['posts-tag'], revalidate: 60 },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts',
      expect.objectContaining({
        signal: controller.signal,
        next: { tags: ['posts-tag'], revalidate: 60 },
      }),
    )
  })

  it('normalizes 422 Unprocessable Entity with errors array', async () => {
    const problem = {
      type: 'https://api.beechcms.com/errors/validation',
      title: 'Validation Failed',
      status: 422,
      detail: 'Invalid input fields',
      errors: [{ field: 'email', expected: 'valid email', received: 'invalid', message: 'Invalid email format' }],
    }
    const fetchMock = mockFetch(422, problem, 'application/problem+json', 'Unprocessable Entity')
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('users').create({ email: 'invalid' })
    expect(res.data).toBeNull()
    expect(res.error).toEqual(problem)
    expect(res.error?.errors).toHaveLength(1)
  })

  it('encapsulates network errors with status: 0 without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Connection timed out'))
    const client = createBeechServerClient({ ...baseConfig, fetch: fetchMock })
    const res = await client.content('articles').create({ title: 'Test' })
    expect(res.data).toBeNull()
    expect(res.error).toEqual({
      type: 'about:blank',
      title: 'Network Error',
      status: 0,
      detail: 'Connection timed out',
    })
  })

  it('alias createBeechClient works identically to createBeechServerClient', () => {
    expect(createBeechClient).toBe(createBeechServerClient)
  })
})
