---
title: Search SDK & Engine
description: Edge-native vector semantic search and full-text hybrid search with @beechcms/search-client.
---

# Search SDK & Engine

The `@beechcms/search-client` SDK allows you to easily implement high-performance, edge-native vector search into your frontend applications. It provides hybrid search capabilities by combining full-text search (FTS) with vector semantic search.

## Installation & Setup

Install the package via your preferred package manager:

```bash
npm install @beechcms/search-client
```

Create the client with your API origin and the **publishable key** (`beech_pk_…`). Every search route sits under `/api/v1/public`, behind the same key check as the rest of the Public API, so without the key the index downloads fail and the semantic tier answers `401`. A secret key (`beech_sk_…`) is refused: this client runs in the browser.

```typescript
import { createBeechSearchClient } from '@beechcms/search-client';

const searchClient = createBeechSearchClient('https://your-api.beechcms.com', {
  publishableKey: import.meta.env.PUBLIC_BEECH_PUBLISHABLE_KEY,
  // Optional: called when the semantic tier fails (status 0 = network error); search() still returns lexical results.
  onEmbedError: (error) => console.warn('semantic search unavailable', error.status, error.message),
});
```

| Option | Default | Description |
| :--- | :--- | :--- |
| `publishableKey` | — | Sent as `X-API-Key` on the index and embed requests. |
| `onEmbedError` | — | Receives `{ status, message }` when the embed call fails. Without it, a `401`/`403` is logged with `console.warn` and other failures (`429`, `5xx`, network) degrade to lexical silently. |
| `debounceMs` | `250` | Debounce window of `search()`. |
| `dimensions` | `384` | Vector size; must match the index manifest. |

## Loading the Index

The Worker compiles each seed's semantic index into R2 and serves it from the Public API:

| Route | Returns |
| :--- | :--- |
| `GET /api/v1/public/search/index/:seedSlug/manifest.json` | The records and the index fingerprint |
| `GET /api/v1/public/search/index/:seedSlug/vectors.bin` | The pre-computed vectors (`ETag` = the manifest fingerprint) |
| `GET /api/v1/public/search/embed?q=…` | The query embedding, called by `search()` |

The index routes answer `404` when the seed is not publicly readable (`allowPublicRead`) or has no compiled index yet. Load the index before searching:

```typescript
const base = 'https://your-api.beechcms.com/api/v1/public/search/index/posts';
await searchClient.loadIndex(`${base}/manifest.json`, `${base}/vectors.bin`);
```

`loadIndex` accepts any two URLs, so you can also host copies of the two files on your own CDN. The `X-API-Key` header is sent there too.

### Client-Side Vector Indexing & Caching

The SDK heavily optimizes client-side performance:
- **In-memory Search:** Vector comparisons (cosine similarity/dot product) are performed directly in-memory, resulting in blazingly fast querying.
- **Index Caching (`ttlMs` & ETags):** Downloading the vector binary (`vectors.bin`) can be heavy. To prevent unnecessary downloads, the SDK uses intelligent caching via the browser's Cache API (with an IndexedDB fallback), respecting HTTP cache headers like `ETag`. You can conceptually manage data freshness via caching layers (e.g. configuring `ttlMs` on your API endpoints to issue fresh ETags) so that clients only pull new vectors when absolutely necessary.

## Hybrid Search (Lexical + Semantic)

Once loaded, the `search` method performs a powerful hybrid search using Reciprocal Rank Fusion (RRF).

It internally executes:
1. **Lexical Search:** Full-text keyword matching against the in-memory index metadata.
2. **Semantic Search:** Fetches an embedding vector for the user's query from your API, then performs an in-memory dot product comparison against the cached vectors.
3. **RRF:** The results from both tiers are seamlessly combined to provide highly accurate, ranked results.

```typescript
// search(query: string, limit: number = 10)
const results = await searchClient.search('how to configure vitepress', 5);

results.forEach(result => {
  console.log(`Rank Score: ${result.score}`);
  console.log(`Record Data: ${JSON.stringify(result.record)}`);
});
```

### Debounced Search Calls

To optimize network usage (specifically, generating the query embedding) during active typing, the `search` method includes built-in debouncing with a 250ms delay. You can bind it directly to an input's `onChange` event in your UI without overwhelming your API.

```tsx
// React example
const SearchBox = () => {
  const [results, setResults] = useState([]);

  const handleSearch = async (e) => {
    const query = e.target.value;
    // Calling this on every keystroke is safe! 
    // The SDK automatically debounces the execution.
    const searchRes = await searchClient.search(query, 10);
    setResults(searchRes);
  };

  return (
    <div>
      <input type="text" onChange={handleSearch} placeholder="Search documentation..." />
      <ul>
        {results.map(r => <li key={r.record.id}>{r.record.title}</li>)}
      </ul>
    </div>
  );
};
```
