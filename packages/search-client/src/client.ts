import { IndexManifest, SearchResult, SearchClientOptions } from './types.js';
import { fetchWithCache } from './utils/cache.js';
import { dotProduct } from './utils/math.js';

export class SearchClient {
  private manifest: IndexManifest | null = null;
  private vectors: Float32Array | null = null;
  private dimensions = 384;
  private apiOrigin: string;
  private debounceMs = 250;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingResolve: ((results: SearchResult[]) => void) | null = null;

  constructor(apiOrigin: string, options?: SearchClientOptions) {
    this.apiOrigin = apiOrigin;
    if (options?.dimensions !== undefined) {
      this.dimensions = options.dimensions;
    }
    if (options?.debounceMs !== undefined) {
      this.debounceMs = options.debounceMs;
    }
  }

  async loadIndex(manifestUrl: string, vectorsUrl: string): Promise<void> {
    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) throw new Error('Failed to load manifest');
    this.manifest = await manifestRes.json();
    
    if (this.manifest!.dimensions !== this.dimensions) {
      throw new Error(`Invalid dimensions: expected ${this.dimensions}`);
    }

    const buffer = await fetchWithCache(vectorsUrl, this.manifest!.fingerprint);
    this.vectors = new Float32Array(buffer);
    
    const expectedLength = this.manifest!.records.length * this.dimensions;
    if (this.vectors.length !== expectedLength) {
      throw new Error('Vector array size mismatch');
    }
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    return new Promise((resolve, reject) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        if (this.pendingResolve) {
          this.pendingResolve([]);
          this.pendingResolve = null;
        }
      }

      this.pendingResolve = resolve;

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.pendingResolve = null;
        this._executeSearch(query, limit).then(resolve).catch(reject);
      }, this.debounceMs);
    });
  }

  private async _executeSearch(query: string, limit: number): Promise<SearchResult[]> {
    if (!this.manifest || !this.vectors) throw new Error('Index not loaded');

    // Lexical Search (Tier 1)
    const lowerQuery = query.toLowerCase().trim();
    const terms = lowerQuery.split(/\s+/).filter(t => t.length > 0);
    const lexicalResults = this.manifest.records.map(record => {
      let score = 0;
      const lowerTitle = (record.title || '').toLowerCase();
      if (lowerQuery.length > 0 && lowerTitle.includes(lowerQuery)) {
        score += 10;
      }
      for (const term of terms) {
        if (lowerTitle.includes(term)) {
          score += 5;
        }
        for (const [key, value] of Object.entries(record)) {
          if (key !== 'title' && typeof value === 'string' && value.toLowerCase().includes(term)) {
            score += 1;
          }
        }
      }
      return { record, score };
    }).filter(r => r.score > 0);

    let semanticResults: Array<{record: any, score: number}> = [];

    // Semantic Search (Tier 2)
    if (query.trim().length > 0) {
      try {
        const url = new URL(`${this.apiOrigin}/api/v1/public/search/embed`);
        url.searchParams.set('q', query);
        const res = await fetch(url.toString());
        
        if (res.ok) {
          const { embedding } = await res.json();
          if (embedding && Array.isArray(embedding)) {
            const queryVector = new Float32Array(embedding);
            
            // Keep only records with positive similarity; zero or negative means no match.
            semanticResults = this.manifest.records.map((record, index) => {
              const start = index * this.dimensions;
              const recordVector = this.vectors!.subarray(start, start + this.dimensions);
              const score = dotProduct(queryVector, recordVector);
              return { record, score };
            }).filter(r => r.score > 0);
          }
        }
        // Silently fail on 429, 503, or other errors to degrade gracefully
      } catch (e) {
        // Fallback to purely lexical
      }
    }

    // Reciprocal Rank Fusion (RRF)
    const k = 60;
    const rrfMap = new Map<string, { record: any, rrfScore: number }>();

    const addRankings = (results: Array<{record: any, score: number}>) => {
      results.sort((a, b) => b.score - a.score);
      results.forEach((res, rank) => {
        const id = res.record.id;
        const current = rrfMap.get(id) || { record: res.record, rrfScore: 0 };
        current.rrfScore += 1 / (k + rank + 1);
        rrfMap.set(id, current);
      });
    };

    addRankings(lexicalResults);
    if (semanticResults.length > 0) {
      addRankings(semanticResults);
    }

    return Array.from(rrfMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map(r => ({ record: r.record, score: r.rrfScore }));
  }
}

export function createBeechSearchClient(apiOrigin: string, options?: SearchClientOptions): SearchClient {
  return new SearchClient(apiOrigin, options);
}

