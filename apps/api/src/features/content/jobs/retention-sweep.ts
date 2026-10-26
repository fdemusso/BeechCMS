// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { EntryNotFoundError, resolveRetentionDays } from '@beechcms/core'
import type { ContentRepository, ISiteSettingsRepository, Seed } from '@beechcms/core'
import { deleteR2Objects, type DeleteR2ObjectsContext } from '../../../shared/storage/upload'
import { extractMediaKeysFromData } from '../../../shared/utils/media-utils'

/** Sweep cadence on the every-minute cron (wrangler.jsonc). Retention is day-granular; 5 min is plenty. */
export const RETENTION_SWEEP_INTERVAL_MINUTES = 5

/** Purge ATTEMPTS per run, across all seeds. Each purge costs ~3 subrequests + ~4 per media key;
 *  25 keeps one invocation well inside the Workers subrequest budget and drains ~7 200 entries/day. */
export const RETENTION_SWEEP_MAX_PURGES = 25

export interface RetentionSweepDependencies {
  /** MUST be built with a deletion ledger: the sweep relies on purge's ledger-first write. */
  repository: ContentRepository
  siteSettingsRepository: ISiteSettingsRepository
  /** Active, non-quarantined seeds, in the order they are swept. */
  seeds: Seed[]
  /** Same structural context `deleteR2Objects` takes in the HTTP handlers. */
  media: DeleteR2ObjectsContext
  cdnUrl?: string
}

export interface RetentionSweepResult {
  purged: Array<{ seedSlug: string; id: string }>
  /** `id: null` = the seed's expiry query itself failed. */
  failed: Array<{ seedSlug: string; id: string | null; reason: string }>
}

/** True when the cron tick at `scheduledTimeMs` (UTC) falls on a sweep minute. */
export function isRetentionSweepTick(scheduledTimeMs: number): boolean {
  return new Date(scheduledTimeMs).getUTCMinutes() % RETENTION_SWEEP_INTERVAL_MINUTES === 0
}

/**
 * Purges trashed entries whose effective retention has elapsed, oldest first, across all seeds.
 *
 * @remarks
 * Stateless and bounded by {@link RETENTION_SWEEP_MAX_PURGES}: every run re-queries D1, so a crash or a
 * skipped tick loses nothing. Purges go through `ContentRepository.purge` with no actor (ledger
 * `actorId: null` marks a system purge). No hooks, automations or activity log run: those fired at
 * soft delete. R2 media cleanup is best effort and never fails an already purged entry.
 *
 * @param deps - Repositories, seeds and media context; see {@link RetentionSweepDependencies}.
 * @param nowSeconds - Unix seconds from the caller's clock.
 * @throws If the site settings cannot be read; nothing is purged in that case.
 */
export async function runRetentionSweep(
  deps: RetentionSweepDependencies,
  nowSeconds: number,
): Promise<RetentionSweepResult> {
  const { repository, siteSettingsRepository, seeds, media, cdnUrl } = deps
  const result: RetentionSweepResult = { purged: [], failed: [] }

  // No fallback to the default on failure: a transient error must not purge what an admin kept with 0.
  const settings = await siteSettingsRepository.getAll()
  let remaining = RETENTION_SWEEP_MAX_PURGES

  for (const seed of seeds) {
    if (remaining === 0) break

    const retentionDays = resolveRetentionDays(seed, settings.trashRetentionDays)
    if (retentionDays === 0) continue

    let expiredIds: string[]
    try {
      expiredIds = await repository.findExpiredByRetention(seed, retentionDays, nowSeconds, remaining)
    } catch (error) {
      result.failed.push({ seedSlug: seed.slug, id: null, reason: errorMessage(error) })
      continue
    }

    for (const id of expiredIds) {
      remaining--
      let purgedRow: Record<string, unknown>
      try {
        purgedRow = (await repository.purge(seed, id)).row
      } catch (error) {
        // Restored or purged by a user between the query and the purge.
        if (error instanceof EntryNotFoundError) continue
        result.failed.push({ seedSlug: seed.slug, id, reason: errorMessage(error) })
        continue
      }
      result.purged.push({ seedSlug: seed.slug, id })

      try {
        const keys = extractMediaKeysFromData(seed, purgedRow, cdnUrl)
        if (keys.length > 0) await deleteR2Objects(media, keys)
      } catch (error) {
        console.warn('[retention-sweep] R2 cleanup failed (orphaned files)', { seed: seed.slug, id, error })
      }
    }
  }

  logSummary(result)
  return result
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function logSummary(result: RetentionSweepResult): void {
  if (result.purged.length + result.failed.length === 0) return
  console.log(`[retention-sweep] purged ${result.purged.length}, failed ${result.failed.length}`)
  for (const { seedSlug, id, reason } of result.failed) {
    console.error('[retention-sweep] failure', { seed: seedSlug, id, reason })
  }
}
