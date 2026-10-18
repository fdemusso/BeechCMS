// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { D1Database } from '@cloudflare/workers-types'
import type { Branch, IContentScanRepository, Seed } from '@beechcms/core'

// A richtext body or a json field (gallery, settings blob, ...) can embed a media URL
// just as freely as a dedicated file branch, so all three are scanned the same way.
const MEDIA_SCAN_BRANCH_TYPES: ReadonlySet<Branch['type']> = new Set(['file', 'richtext', 'json'])

export class D1ContentScanRepository implements IContentScanRepository {
  constructor(private readonly db: D1Database) {}

  async getReferencedMediaKeys(seeds: Seed[]): Promise<Set<string>> {
    const referencedMediaKeys = new Set<string>()

    for (const seed of seeds) {
      const mediaFields = seed.branches.filter(branch => MEDIA_SCAN_BRANCH_TYPES.has(branch.type))
      if (mediaFields.length === 0) continue

      const mediaColumns = mediaFields.map(field => field.alias).join(', ')
      // A file kept only by an unpublished draft is still referenced.
      const tables = seed.allowDrafts ? [`content_${seed.slug}`, `content_${seed.slug}_drafts`] : [`content_${seed.slug}`]
      for (const table of tables) {
        const contentRows = await this.readColumns(table, mediaColumns)
        this.collectMediaKeys(contentRows, referencedMediaKeys)
      }
    }

    // The active profile picture is a core system reference with no seed representation,
    // so `users` is scanned unconditionally rather than through the seed loop above.
    const avatarRows = await this.readColumns('users', 'avatar_url')
    this.collectMediaKeys(avatarRows, referencedMediaKeys)

    return referencedMediaKeys
  }

  private collectMediaKeys(rows: Record<string, string | null>[], into: Set<string>): void {
    for (const row of rows) {
      const rowContentString = Object.values(row).filter(Boolean).join(' ')
      for (const keyMatch of rowContentString.matchAll(/\/api\/media\/([^"'\s\\,}\]]+)/g)) {
        try {
          into.add(decodeURIComponent(keyMatch[1]))
        } catch {
          // Ignore malformed URI
        }
      }
    }
  }

  private async readColumns(table: string, columns: string): Promise<Record<string, string | null>[]> {
    try {
      const contentData = await this.db.prepare(`SELECT ${columns} FROM ${table}`).all<Record<string, string | null>>()
      return contentData.results ?? []
    } catch (error) {
      // Table not yet created (seed:load not run). Any other failure must surface: a skipped
      // table would make its files look orphaned and offer them for deletion.
      if (error instanceof Error && /no such table/i.test(error.message)) return []
      throw error
    }
  }
}
