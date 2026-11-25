// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { createBeechBrowserClient, createBeechClient } from './index.js'
import type { BeechBrowserClientConfig } from '../types.js'

// The default registry types every row as `unknown`; these tests read fields off the rows.
type TestRegistry = Record<string, Record<string, unknown>>

function mockFetch(status: number, body: unknown, contentType = 'application/json', statusText = 'OK') {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers({ 'Content-Type': contentType }),
    json: async () => body,
  } as unknown as Response)
}

const baseConfig: BeechBrowserClientConfig = {
  baseUrl: 'https://api.example.com/',
  publishableKey: 'beech_pk_test_key',
}

describe('Browser Client (@beechcms/client/browser)', () => {
  it('throws error on missing or invalid configuration', () => {
    expect(() => createBeechBrowserClient(null as unknown as BeechBrowserClientConfig)).toThrow(TypeError)
    expect(() => createBeechBrowserClient<TestRegistry>({ baseUrl: '', publishableKey: 'key' })).toThrow(/baseUrl is required/)
    expect(() => createBeechBrowserClient<TestRegistry>({ baseUrl: 'https://api.example.com', publishableKey: '' })).toThrow(/publishableKey is required/)
  })

  it('normalizes trailing slashes on baseUrl', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { total: 0, returned: 0, seed: 'posts' } })
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, baseUrl: 'https://api.example.com///', fetch: fetchMock })
    await client.collection('posts').list()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/posts',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('list sends GET request with X-API-Key and search params', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: '1', title: 'A' }], meta: { total: 1, returned: 1, seed: 'posts' } })
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ title: 'hello' }).select(['id']).list()
    expect(res.error).toBeNull()
    expect(res.data?.data).toHaveLength(1)
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('filter=')
    expect(calledUrl).toContain('fields=id')
  })

  it('get by id is performed using where and first, sending GET request with ?filter=...', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: 'p_123', title: 'Post' }], meta: { seed: 'posts' } })
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ id: 'p_123' }).first()
    expect(res.error).toBeNull()
    expect(res.data?.data.id).toBe('p_123')
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('filter=')
    expect(calledUrl).toContain('limit=1')
  })

  it('get by slug is performed using where and first, sending GET request with ?filter=...', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: 'p_123', slug: 'my-slug' }], meta: { seed: 'posts' } })
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ slug: 'my-slug' }).first()
    expect(res.error).toBeNull()
    expect(res.data?.data.slug).toBe('my-slug')
    const calledUrl: string = fetchMock.mock.calls[0][0]
    expect(calledUrl).toContain('filter=')
    expect(calledUrl).toContain('limit=1')
  })

  it('first() returns a 404 BeechProblem when the list comes back empty', async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { seed: 'posts' } })
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ id: 'missing' }).first()
    expect(res.data).toBeNull()
    expect(res.error).toEqual(expect.objectContaining({ status: 404, type: 'not_found' }))
  })

  it('list forwards the validate option without altering the response', async () => {
    const fetchMock = mockFetch(200, { data: [{ id: '1' }], meta: { total: 1, returned: 1, seed: 'posts' } })
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').list({ validate: true })
    expect(res.error).toBeNull()
    expect(res.data?.data).toHaveLength(1)
  })

  it('the resource type has no create or update', () => {
    const client = createBeechBrowserClient(baseConfig)
    const resource = client.collection('posts')

    // `type-check` enforces these directives: a browser resource must not type-check a write.
    // @ts-expect-error create is not part of the browser resource
    expect(resource.create).toBeUndefined()
    // @ts-expect-error update is not part of the browser resource
    expect(resource.update).toBeUndefined()
  })

  it('a config literal with apiKey is a type error and throws at runtime', () => {
    // @ts-expect-error apiKey was replaced by publishableKey
    const legacyConfig: BeechBrowserClientConfig = { baseUrl: 'https://api.example.com', apiKey: 'beech_pk_test_key' }

    expect(() => createBeechBrowserClient(legacyConfig)).toThrow(/apiKey was removed: pass publishableKey/)
  })

  it('returns normalized RFC 9457 error on 4xx/5xx HTTP failure without throwing', async () => {
    const problem = {
      type: 'https://api.beechcms.com/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'Resource does not exist',
    }
    const fetchMock = mockFetch(404, problem, 'application/problem+json', 'Not Found')
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').where({ id: 'missing' }).first()
    expect(res.data).toBeNull()
    expect(res.error).toEqual(expect.objectContaining({ status: 404, detail: 'Resource does not exist' }))
  })

  it('encapsulates network errors with status: 0 without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, fetch: fetchMock })
    const res = await client.collection('posts').list()
    expect(res.data).toBeNull()
    expect(res.error).toEqual(expect.objectContaining({ status: 0, detail: 'Failed to fetch' }))
  })

  it('alias createBeechClient works identically to createBeechBrowserClient', () => {
    expect(createBeechClient).toBe(createBeechBrowserClient)
  })
})

describe('createBeechBrowserClient — schema fingerprint drift', () => {
  function revisionFetch(revision: string) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json', 'X-Schema-Revision': revision }),
      json: async () => ({ data: [], meta: { total: 0, returned: 0, seed: 'posts' } }),
    } as unknown as Response)
  }

  it('a schemaFingerprint that differs from X-Schema-Revision returns a 409 schema_drift problem', async () => {
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, schemaFingerprint: 'v2:expected', fetch: revisionFetch('v2:stale') })

    const res = await client.collection('posts').list()

    // The value comes from the config, as exported by beech types generate. No module mock: the old
    // tests stubbed the client's own empty constant, so the check passed here and never ran for users.
    expect(res.data).toBeNull()
    expect(res.error).toMatchObject({ type: 'schema_drift', status: 409 })
  })

  it('a schemaFingerprint equal to X-Schema-Revision returns the data', async () => {
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, schemaFingerprint: 'v2:expected', fetch: revisionFetch('v2:expected') })

    const res = await client.collection('posts').list()

    expect(res.error).toBeNull()
    expect(res.data).toEqual({ data: [], meta: { total: 0, returned: 0, seed: 'posts' } })
  })

  it('without schemaFingerprint the drift check stays off', async () => {
    const client = createBeechBrowserClient<TestRegistry>({ ...baseConfig, fetch: revisionFetch('v2:anything') })

    const res = await client.collection('posts').list()

    expect(res.error).toBeNull()
  })
})
