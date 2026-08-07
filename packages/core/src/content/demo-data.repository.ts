import type { ContentRepository } from './content.repository.js'
import type { Seed } from '../engine/types.js'

export interface IDemoDataRepository {
  /** Ingests structured demo datasets into the database via ContentRepository domain layer. */
  loadDemoData(repository: ContentRepository, getSeed: (slug: string) => Seed | null): Promise<void>
}

