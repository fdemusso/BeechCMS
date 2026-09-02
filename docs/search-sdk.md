# BeechCMS Search SDK

The `@beechcms/search-client` SDK allows you to easily implement high-performance, edge-native vector search into your frontend applications. It provides hybrid search capabilities by combining full-text search (FTS) with vector semantic search.

## Installation & Setup

Install the package via your preferred package manager:

```bash
npm install @beechcms/search-client
```

To get started, you'll need to instantiate the `SearchClient`. You can do this directly or by wrapping it in a factory function like `createBeechSearchClient`:

```typescript
import { SearchClient } from '@beechcms/search-client';

// Initialize the client with your backend API origin
export const createBeechSearchClient = (apiOrigin: string) => {
  return new SearchClient(apiOrigin);
};

const searchClient = createBeechSearchClient('https://your-api.beechcms.com');
```

## Loading the Index

Before performing searches, you must load the index manifest and the pre-computed vectors.

```typescript
await searchClient.loadIndex(
  'https://your-api.beechcms.com/api/v1/public/search/manifest.json',
  'https://your-api.beechcms.com/api/v1/public/search/vectors.bin'
);
```

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
