import type { Seed } from './types.js'

export interface IContentScanRepository {
  /**
   * Scans across all registered seeds to identify media keys that are currently referenced
   * by any content entry. Used for orphaned media detection and storage analytics.
   */
  getReferencedMediaKeys(seeds: Seed[]): Promise<Set<string>>
}
