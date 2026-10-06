// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  generateDropTable,
  type BeechBucket,
  type IClock,
  type IIdGenerator,
  type ISeedMediaPurgeRepository,
} from '@beechcms/core'
import { extractMediaKeysFromData } from '../../shared/utils/media-utils'

export const SEED_MEDIA_PURGE_JOB = 'seed-media-purge'
const ROW_PAGE_SIZE = 100
const KEY_PAGE_SIZE = 25
const LEASE_SECONDS = 120

export interface SeedMediaPurgeDependencies {
  repository: ISeedMediaPurgeRepository
  bucket: BeechBucket
  clock: IClock
  idGenerator: IIdGenerator
  cdnUrl?: string
}

/** Runs one bounded step; the persisted job survives transport failures and retries. */
export async function runSeedMediaPurgeStep(id: string, deps: SeedMediaPurgeDependencies): Promise<boolean> {
  const { repository, bucket, clock, idGenerator, cdnUrl } = deps
  const token = idGenerator.uuid()
  const job = await repository.claim(id, token, clock.nowSeconds(), LEASE_SECONDS)
  if (!job) return false

  try {
    if (job.phase === 'purging') {
      const keys = await repository.listKeys(id, KEY_PAGE_SIZE)
      for (const key of keys) {
        await bucket.delete(key)
        await repository.completeKey(id, token, key, clock.nowSeconds())
      }
      if (keys.length < KEY_PAGE_SIZE) {
        await repository.finish(id, token, clock.nowSeconds())
        return false
      }
      return true
    }

    const table = `content_${job.slug}${job.phase === 'drafts' ? '_drafts' : ''}`
    const fileAliases = job.definition.branches.filter(branch => branch.type === 'file').map(branch => branch.alias)
    const physicalColumns = fileAliases.length ? await repository.getColumns(table) : null
    const columns = fileAliases.filter(alias => physicalColumns?.has(alias))

    if (columns.length > 0) {
      const rows = await repository.readPage(table, columns, job.cursor, ROW_PAGE_SIZE)
      const keys = rows.flatMap(row => extractMediaKeysFromData(job.definition, row.data, cdnUrl))
      const cursor = rows.at(-1)?.rowid ?? job.cursor
      await repository.stagePage(id, token, cursor, keys, clock.nowSeconds())
      if (rows.length === ROW_PAGE_SIZE) return true
    }

    if (job.phase === 'live' && job.definition.allowDrafts) {
      await repository.moveToDrafts(id, token, clock.nowSeconds())
    } else {
      try {
        await repository.dropAndStartPurge(id, token, generateDropTable(job.definition), clock.nowSeconds())
      } catch (error) {
        // D1 rolls the DROP batch back; restore access while all content and media still exist.
        await repository.abortDrop(id, token, clock.nowSeconds())
        console.error(`[seed-purge] DROP failed for '${job.slug}'; seed restored`, error)
        return false
      }
    }
    return true
  } finally {
    await repository.release(id, token)
  }
}
