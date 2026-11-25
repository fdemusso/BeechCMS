export interface IndexManifestRecord {
  id: string;
  title: string;
  [key: string]: any; // other text fields
}

export interface IndexManifest {
  model: string;
  dimensions: number; // MUST be 384 for bge-small-en-v1.5
  fingerprint: string;
  records: IndexManifestRecord[];
}

export interface SearchResult {
  record: IndexManifestRecord;
  score: number;
}

/** A failed semantic (embed) call. `status` is 0 when the request itself failed. */
export interface SearchEmbedError {
  status: number;
  message: string;
}

export interface SearchClientOptions {
  dimensions?: number;
  debounceMs?: number;
  /**
   * Publishable key (`beech_pk_…`), sent as `X-API-Key` on the embed and index requests: those
   * routes sit behind the Public API key check. A secret key (`beech_sk_…`) is refused.
   */
  publishableKey?: string;
  /**
   * Called when the semantic tier fails; `search()` still resolves with the lexical results.
   * Without it, a 401/403 (missing or wrong key) is logged with `console.warn`.
   */
  onEmbedError?: (error: SearchEmbedError) => void;
}
