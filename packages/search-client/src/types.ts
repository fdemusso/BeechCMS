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
