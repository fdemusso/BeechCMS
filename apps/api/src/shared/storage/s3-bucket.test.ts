// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3Bucket, S3Error } from './s3-bucket'

const bucket = new S3Bucket({
  endpoint: 'https://account.r2.cloudflarestorage.com',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  bucketName: 'media',
  baseUrl: 'https://api.example.test',
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async (_request: Request) => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('S3Bucket.presignPut', () => {
  it('binds the declared Content-Type into the SigV4 signed headers', async () => {
    // Presigning is local SigV4 math; no network call is made.
    // aws4fetch treats content-type as unsignable by default, so a client could send any
    // Content-Type under a valid signature and bypass the MIME allowlist checked at presign time.
    const url = await bucket.presignPut('1700000000-abcd1234-photo.png', {
      expiresIn: 900,
      contentType: 'image/png',
      contentLength: 12345,
    })

    const signedHeaders = (new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '').split(';')
    expect(signedHeaders).toContain('content-type')
    expect(signedHeaders).toContain('content-length')
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('900')
  })

  it('uses a path-style URL and adds no checksum parameter', async () => {
    const url = new URL(await bucket.presignPut('folder/photo one.png', { expiresIn: 60, contentType: 'image/png' }))

    expect(url.origin).toBe('https://account.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/media/folder/photo%20one.png')
    expect([...url.searchParams.keys()].some((name) => name.toLowerCase().includes('checksum'))).toBe(false)
  })
})

describe('S3Bucket.presignGet', () => {
  it('returns a query-signed GET URL with the requested expiry', async () => {
    const url = new URL(await bucket.presignGet('a/b.png', { expiresIn: 300 }))

    expect(url.pathname).toBe('/media/a/b.png')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('S3Bucket.put', () => {
  it('sends a signed PUT with content type and metadata headers', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 200 }))

    await bucket.put('/dir/file.txt', new TextEncoder().encode('hello'), {
      contentType: 'text/plain',
      metadata: { owner: 'u1' },
    })

    const request = fetchMock.mock.calls[0][0]
    expect(request.method).toBe('PUT')
    expect(new URL(request.url).pathname).toBe('/media/dir/file.txt')
    expect(request.headers.get('content-type')).toBe('text/plain')
    expect(request.headers.get('x-amz-meta-owner')).toBe('u1')
    expect(request.headers.get('authorization')).toContain('AWS4-HMAC-SHA256')
  })

  it('throws an S3Error carrying the status and code on failure', async () => {
    stubFetch(new Response('<Error><Code>AccessDenied</Code><Message>nope</Message></Error>', { status: 403 }))

    await expect(bucket.put('k', new Uint8Array([1]))).rejects.toMatchObject({
      status: 403,
      code: 'AccessDenied',
    })
    await expect(bucket.put('k', new Uint8Array([1]))).rejects.toBeInstanceOf(S3Error)
  })
})

describe('S3Bucket.get / head', () => {
  it('returns null on 404', async () => {
    stubFetch(new Response(null, { status: 404 }))
    expect(await bucket.get('missing')).toBeNull()
    stubFetch(new Response(null, { status: 404 }))
    expect(await bucket.head('missing')).toBeNull()
  })

  it('rethrows non-404 errors', async () => {
    stubFetch(new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }))
    await expect(bucket.get('k')).rejects.toMatchObject({ status: 403 })
  })

  it('maps response headers to size, content type and metadata', async () => {
    stubFetch(
      new Response('abc', {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '3', 'x-amz-meta-owner': 'u1' },
      }),
    )

    const result = await bucket.get('k')

    expect(result).toMatchObject({ contentType: 'image/png', size: 3, metadata: { owner: 'u1' } })
    expect(await new Response(result!.body).text()).toBe('abc')
  })

  it('head reports size and metadata without a body', async () => {
    stubFetch(new Response(null, { status: 200, headers: { 'content-length': '42', 'x-amz-meta-a': 'b' } }))
    expect(await bucket.head('k')).toEqual({ size: 42, contentType: undefined, metadata: { a: 'b' } })
  })
})

describe('S3Bucket.delete', () => {
  it('sends a signed DELETE', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))
    await bucket.delete('x.png')
    expect(fetchMock.mock.calls[0][0].method).toBe('DELETE')
  })
})

describe('S3Bucket.list', () => {
  const page = (items: string, next = '') =>
    `<?xml version="1.0"?><ListBucketResult>${items}${next ? `<NextContinuationToken>${next}</NextContinuationToken>` : ''}</ListBucketResult>`

  it('parses keys (with XML entities), sizes and the continuation cursor', async () => {
    const fetchMock = stubFetch(
      new Response(
        page(
          '<Contents><Key>a&amp;b.png</Key><Size>10</Size></Contents><Contents><Key>c.png</Key><Size>5</Size></Contents>',
          'tok&amp;1',
        ),
      ),
    )

    const result = await bucket.list({ prefix: 'p/', limit: 2, cursor: 'prev' })

    expect(result).toEqual({
      objects: [
        { key: 'a&b.png', size: 10 },
        { key: 'c.png', size: 5 },
      ],
      cursor: 'tok&1',
    })
    const url = new URL(fetchMock.mock.calls[0][0].url)
    expect(url.pathname).toBe('/media')
    expect(url.searchParams.get('list-type')).toBe('2')
    expect(url.searchParams.get('prefix')).toBe('p/')
    expect(url.searchParams.get('max-keys')).toBe('2')
    expect(url.searchParams.get('continuation-token')).toBe('prev')
  })

  it('returns an empty list and no cursor for an empty bucket', async () => {
    stubFetch(new Response(page('')))
    expect(await bucket.list()).toEqual({ objects: [], cursor: undefined })
  })

  it('getTotalSize sums every page', async () => {
    const responses = [
      page('<Contents><Key>a</Key><Size>10</Size></Contents>', 'next'),
      page('<Contents><Key>b</Key><Size>32</Size></Contents>'),
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(responses.shift())))

    expect(await bucket.getTotalSize()).toBe(42)
  })
})

describe('S3Bucket.getUrl', () => {
  it('prefers the CDN URL and falls back to the API media route', () => {
    const withCdn = new S3Bucket({
      endpoint: 'https://e.test',
      accessKeyId: 'a',
      secretAccessKey: 'b',
      bucketName: 'media',
      baseUrl: 'https://api.example.test/',
      cdnUrl: 'https://cdn.example.test/',
    })
    expect(withCdn.getUrl('/a b/c.png')).toBe('https://cdn.example.test/a%20b/c.png')
    expect(bucket.getUrl('a b/c.png')).toBe('https://api.example.test/api/media/a%20b/c.png')
  })
})
