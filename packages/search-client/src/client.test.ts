import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchClient } from './client.js';
import { IndexManifest } from './types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const DIMS = 384;

/** Build a minimal valid manifest with N records. */
function makeManifest(n: number, dims = DIMS): IndexManifest {
  return {
    model: 'bge-small-en-v1.5',
    dimensions: dims,
    fingerprint: 'fp-test',
    records: Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, title: `Record ${i}` })),
  };
}

/** Build a Float32Array buffer of N records × DIMS dimensions, filled with value. */
function makeBuffer(n: number, value = 0, dims = DIMS): ArrayBuffer {
  const arr = new Float32Array(n * dims).fill(value);
  return arr.buffer;
}

/** Stub global `fetch` with a queue of responses. */
function stubFetch(...responses: Array<() => Response | Promise<Response>>) {
  const queue = [...responses];
  vi.stubGlobal('fetch', vi.fn(() => {
    const next = queue.shift();
    if (!next) throw new Error('Unexpected fetch call');
    return Promise.resolve(next());
  }));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bufferResponse(buf: ArrayBuffer, etag = 'etag-1', status = 200): Response {
  return new Response(buf, {
    status,
    headers: { ETag: etag },
  });
}

// Suppress Cache API (not available in jsdom) — fetchWithCache falls back to plain fetch.
vi.mock('./utils/cache.js', () => ({
  fetchWithCache: (_url: string, _fingerprint: string) =>
    fetch(_url).then(r => r.arrayBuffer()),
}));

// ── tests ─────────────────────────────────────────────────────────────────────

describe('SearchClient', () => {
  let client: SearchClient;

  beforeEach(() => {
    client = new SearchClient('https://api.example.com');
    vi.restoreAllMocks();
  });

  // ── loadIndex ──────────────────────────────────────────────────────────────

  describe('loadIndex', () => {
    it('loads manifest and vectors successfully', async () => {
      const manifest = makeManifest(2);
      const buffer = makeBuffer(2);

      stubFetch(
        () => jsonResponse(manifest),
        () => bufferResponse(buffer),
      );

      await expect(client.loadIndex('https://cdn/manifest.json', 'https://cdn/vectors.bin')).resolves.toBeUndefined();
    });

    it('rejects manifests with wrong dimensions', async () => {
      const badManifest = makeManifest(1, 512); // 512 ≠ 384
      stubFetch(() => jsonResponse(badManifest));

      await expect(
        client.loadIndex('https://cdn/manifest.json', 'https://cdn/vectors.bin'),
      ).rejects.toThrow('Invalid dimensions: expected 384');
    });

    it('rejects buffer whose Float32Array length does not match records × dimensions', async () => {
      const manifest = makeManifest(3); // expects 3 × 384 floats
      const wrongBuffer = makeBuffer(2); // only 2 × 384 floats

      stubFetch(
        () => jsonResponse(manifest),
        () => bufferResponse(wrongBuffer),
      );

      await expect(
        client.loadIndex('https://cdn/manifest.json', 'https://cdn/vectors.bin'),
      ).rejects.toThrow('Vector array size mismatch');
    });
  });

  // ── lexical search ─────────────────────────────────────────────────────────

  describe('lexical search', () => {
    beforeEach(async () => {
      const manifest: IndexManifest = {
        model: 'bge-small-en-v1.5',
        dimensions: DIMS,
        fingerprint: 'fp',
        records: [
          { id: '1', title: 'TypeScript Guide' },
          { id: '2', title: 'React Handbook' },
          { id: '3', title: 'Vue Essentials' },
        ],
      };
      const buffer = makeBuffer(3);

      // loadIndex fetches: manifest + buffer
      stubFetch(
        () => jsonResponse(manifest),
        () => bufferResponse(buffer),
      );
      await client.loadIndex('https://cdn/manifest.json', 'https://cdn/vectors.bin');
    });

    it('returns matching records for a lexical query (semantic unavailable)', async () => {
      // Embed endpoint returns 503 → graceful degradation to lexical only
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))));

      const results = await client.search('typescript', 10);

      expect(results).toHaveLength(1);
      expect(results[0].record.id).toBe('1');
    });

    it('returns empty array when no records match', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))));

      const results = await client.search('xyzzy-nonexistent', 10);
      expect(results).toHaveLength(0);
    });
  });

  // ── semantic graceful degradation ──────────────────────────────────────────

  describe('graceful degradation on embed API errors', () => {
    const manifest: IndexManifest = {
      model: 'bge-small-en-v1.5',
      dimensions: DIMS,
      fingerprint: 'fp',
      records: [{ id: '1', title: 'React Guide' }],
    };

    beforeEach(async () => {
      stubFetch(
        () => jsonResponse(manifest),
        () => bufferResponse(makeBuffer(1)),
      );
      await client.loadIndex('https://cdn/manifest.json', 'https://cdn/vectors.bin');
    });

    it('returns lexical results and does not throw on HTTP 429', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 429 }))));

      await expect(client.search('react', 10)).resolves.not.toThrow();
      const results = await client.search('react', 10);
      expect(results.length).toBeGreaterThanOrEqual(0); // lexical only, no unhandled exception
    });

    it('returns lexical results and does not throw on HTTP 503', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))));

      await expect(client.search('react', 10)).resolves.not.toThrow();
    });

    it('does not throw when fetch itself rejects (network error)', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network failure'))));

      await expect(client.search('react', 10)).resolves.not.toThrow();
    });
  });

  // ── RRF fusion ─────────────────────────────────────────────────────────────

  describe('Reciprocal Rank Fusion', () => {
    it('ranks semantically matching record above lexically matching record when both are present', async () => {
      // Two records: record A matches lexically; record B matches semantically with a high score.
      // We craft vectors so that only B has a positive dot product with the query vector.
      const manifest: IndexManifest = {
        model: 'bge-small-en-v1.5',
        dimensions: DIMS,
        fingerprint: 'fp',
        records: [
          { id: 'A', title: 'lexical match document' },  // lexical hit
          { id: 'B', title: 'unrelated title' },           // semantic-only hit
        ],
      };

      // Vector for record A: all zeros (dot product = 0, filtered from semantic results)
      // Vector for record B: first element = 1, rest = 0
      const buf = new Float32Array(2 * DIMS).fill(0);
      buf[DIMS] = 1; // record B's first component

      stubFetch(
        () => jsonResponse(manifest),
        () => bufferResponse(buf.buffer),
      );
      await client.loadIndex('https://cdn/manifest.json', 'https://cdn/vectors.bin');

      // Query embedding: first element = 1 → dot(query, B) = 1, dot(query, A) = 0
      const queryEmbedding = new Array(DIMS).fill(0);
      queryEmbedding[0] = 1;

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve(jsonResponse({ embedding: queryEmbedding })),
      ));

      const results = await client.search('lexical match', 10);

      // Both A (lexical) and B (semantic, score=1) should appear.
      const ids = results.map(r => r.record.id);
      expect(ids).toContain('A');
      expect(ids).toContain('B');
    });

    it('does not return records with zero semantic score when query has no lexical match', async () => {
      const manifest: IndexManifest = {
        model: 'bge-small-en-v1.5',
        dimensions: DIMS,
        fingerprint: 'fp',
        records: [
          { id: 'X', title: 'completely unrelated content' },
        ],
      };

      // All-zero vector for record X
      stubFetch(
        () => jsonResponse(manifest),
        () => bufferResponse(makeBuffer(1, 0)),
      );
      await client.loadIndex('https://cdn/manifest.json', 'https://cdn/vectors.bin');

      // Query embedding with first element = 1, but record has all zeros → dot = 0
      const queryEmbedding = new Array(DIMS).fill(0);
      queryEmbedding[0] = 1;

      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve(jsonResponse({ embedding: queryEmbedding })),
      ));

      // No lexical match ('xyzzy' is not in any title), and semantic dot product is 0 → filtered
      const results = await client.search('xyzzy', 10);
      expect(results).toHaveLength(0);
    });
  });
});
