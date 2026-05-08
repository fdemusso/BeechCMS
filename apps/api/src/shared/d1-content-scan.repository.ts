import type { D1Database } from '@cloudflare/workers-types'
import type { IContentScanRepository, Seed } from '@beechcms/core'

export class D1ContentScanRepository implements IContentScanRepository {
  constructor(private readonly db: D1Database) {}

  async getReferencedMediaKeys(seeds: Seed[]): Promise<Set<string>> {
    const referencedMediaKeys = new Set<string>()

    for (const seed of seeds) {
      const mediaFields = seed.branches.filter(branch => branch.type === 'file')
      if (mediaFields.length === 0) continue

      const mediaColumns = mediaFields.map(field => field.alias).join(', ')
      const contentData = await this.db.prepare(
        `SELECT ${mediaColumns} FROM content_${seed.slug}`
      ).all<Record<string, string | null>>()

      for (const contentRow of contentData.results ?? []) {
        const rowContentString = Object.values(contentRow).filter(Boolean).join(' ')
        for (const keyMatch of rowContentString.matchAll(/\/api\/media\/([^"'\s\\,}\]]+)/g)) {
          referencedMediaKeys.add(decodeURIComponent(keyMatch[1]))
        }
      }
    }

    return referencedMediaKeys
  }
}
