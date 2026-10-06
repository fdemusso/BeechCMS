// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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
      // A file kept only by an unpublished draft is still referenced.
      const tables = seed.allowDrafts ? [`content_${seed.slug}`, `content_${seed.slug}_drafts`] : [`content_${seed.slug}`]
      for (const table of tables) {
        const contentRows = await this.readFileColumns(table, mediaColumns)
        for (const contentRow of contentRows) {
          const rowContentString = Object.values(contentRow).filter(Boolean).join(' ')
          for (const keyMatch of rowContentString.matchAll(/\/api\/media\/([^"'\s\\,}\]]+)/g)) {
            try {
              referencedMediaKeys.add(decodeURIComponent(keyMatch[1]))
            } catch {
              // Ignore malformed URI
            }
          }
        }
      }
    }

    return referencedMediaKeys
  }

  private async readFileColumns(table: string, mediaColumns: string): Promise<Record<string, string | null>[]> {
    try {
      const contentData = await this.db.prepare(`SELECT ${mediaColumns} FROM ${table}`).all<Record<string, string | null>>()
      return contentData.results ?? []
    } catch (error) {
      // Table not yet created (seed:load not run). Any other failure must surface: a skipped
      // table would make its files look orphaned and offer them for deletion.
      if (error instanceof Error && /no such table/i.test(error.message)) return []
      throw error
    }
  }
}
