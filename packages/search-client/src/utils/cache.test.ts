import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithCache } from './cache.js';

describe('cache utilities', () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = (globalThis as any).caches;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as any).caches = originalCaches;
    vi.restoreAllMocks();
  });

  it('exports fetchWithCache', () => {
    expect(typeof fetchWithCache).toBe('function');
  });

  it('does not send If-None-Match header on fresh cache miss even if etag is provided', async () => {
    const mockCache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    (globalThis as any).caches = {
      open: vi.fn().mockResolvedValue(mockCache),
    };

    let requestedHeaders: Headers | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      requestedHeaders = new Headers(init?.headers);
      return new Response(new ArrayBuffer(8), { status: 200 });
    });

    const res = await fetchWithCache('https://example.com/vectors.bin', 'test-etag');
    expect(res.byteLength).toBe(8);
    expect(requestedHeaders?.has('If-None-Match')).toBe(false);
  });

  it('sends If-None-Match header when cached response is present', async () => {
    const cachedResponse = new Response(new ArrayBuffer(16), {
      status: 200,
      headers: { ETag: 'cached-etag' }
    });
    const mockCache = {
      match: vi.fn().mockResolvedValue(cachedResponse),
      put: vi.fn().mockResolvedValue(undefined),
    };
    (globalThis as any).caches = {
      open: vi.fn().mockResolvedValue(mockCache),
    };

    let requestedHeaders: Headers | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      requestedHeaders = new Headers(init?.headers);
      return new Response(null, { status: 304 });
    });

    const res = await fetchWithCache('https://example.com/vectors.bin', 'provided-etag');
    expect(res.byteLength).toBe(16);
    expect(requestedHeaders?.get('If-None-Match')).toBe('provided-etag');
  });

  it('sends the given headers on the request through the Cache API path', async () => {
    (globalThis as any).caches = {
      open: vi.fn().mockResolvedValue({ match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) }),
    };
    let requestedHeaders: Headers | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      requestedHeaders = new Headers(init?.headers);
      return new Response(new ArrayBuffer(8), { status: 200 });
    });

    await fetchWithCache('https://example.com/vectors.bin', 'fp', { 'X-API-Key': 'beech_pk_live_abc' });

    expect(requestedHeaders?.get('X-API-Key')).toBe('beech_pk_live_abc');
  });

  it('sends the given headers on the request through the IndexedDB fallback', async () => {
    (globalThis as any).caches = undefined;
    let requestedHeaders: Headers | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      requestedHeaders = new Headers(init?.headers);
      return new Response(new ArrayBuffer(8), { status: 200 });
    });

    await fetchWithCache('https://example.com/vectors.bin', 'fp', { 'X-API-Key': 'beech_pk_live_abc' });

    expect(requestedHeaders?.get('X-API-Key')).toBe('beech_pk_live_abc');
  });
});
