// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { BeechBucket, MediaObject, MediaRepository, SystemStatsRepository } from '@beechcms/core'

/**
 * Context dependencies required to execute media deletion operations.
 */
export interface DeleteR2ObjectsContext {
  /** Variables bound to the request context. */
  var: {
    /** Storage bucket instance used to delete the physical object. */
    bucket: BeechBucket
    /** Media repository used to look up and untrack media database records. */
    mediaRepository: MediaRepository
    /** System statistics repository used to decrement cumulative storage usage. */
    systemStatsRepository: SystemStatsRepository
  }
}

/**
 * Deletes one or more media objects from the storage bucket and synchronizes database tracking and statistics.
 *
 * @remarks
 * For each provided object key, the following sequence is performed:
 * 1. Looks up the media record in `mediaRepository` to obtain file size and ensure the key is tracked.
 *    If the key is not found or the lookup fails, an error is thrown before bucket deletion.
 * 2. Deletes the physical binary object from the storage `bucket`.
 * 3. Untracks the media record from `mediaRepository` and decrements cumulative storage in `systemStatsRepository`.
 * 4. If bucket deletion succeeds but untracking or statistics decrement fails, the key is recorded as out-of-sync
 *    and a composite error is thrown after all operations complete to surface data drift.
 *
 * @param context - Context object holding `bucket`, `mediaRepository`, and `systemStatsRepository` dependencies in `context.var`.
 * @param objectKeys - Array of media storage object keys to delete.
 * @throws {Error} If media record lookup fails or key is untracked in the database.
 * @throws {Error} If the storage bucket deletion fails.
 * @throws {Error} If one or more media records fail to untrack after bucket deletion (data drift).
 * @returns A promise that resolves when all objects have been successfully deleted and untracked.
 */
export async function deleteR2Objects(
  context: DeleteR2ObjectsContext,
  objectKeys: string[]
): Promise<void> {
  const { bucket, mediaRepository, systemStatsRepository } = context.var
  const uniqueKeys = [...new Set(objectKeys)]
  const untrackFailures: string[] = []
  const operationErrors: string[] = []

  await Promise.allSettled(
    uniqueKeys.map(async (objectKey) => {
      // Do not collapse a getByKey rejection (transient DB error) into the same
      // "not tracked" branch as a resolved null — the caller must be able to tell
      // a genuine orphan apart from a lookup failure, otherwise the R2 object is
      // silently skipped and leaked on every retry.
      let mediaObject: MediaObject | null
      try {
        mediaObject = await mediaRepository.getByKey(objectKey)
      } catch (lookupError) {
        operationErrors.push(`Media lookup failed for key, not deleted: ${objectKey}`)
        return
      }
      if (!mediaObject) {
        operationErrors.push(`Media object not found: ${objectKey}`)
        return
      }
      const mediaSizeBytes = mediaObject.size_bytes ?? 0

      // Let the bucket delete failure be recorded so we do not untrack or decrement stats.
      try {
        await bucket.delete(objectKey)
      } catch (deleteError) {
        const msg = deleteError instanceof Error ? deleteError.message : String(deleteError)
        operationErrors.push(msg)
        return
      }

      try {
        await mediaRepository.untrack(objectKey)
        if (mediaSizeBytes > 0) {
          await systemStatsRepository.decrementStorage(mediaSizeBytes)
        }
      } catch (untrackError) {
        console.warn(`Failed to untrack media object: ${objectKey}`, untrackError)
        untrackFailures.push(objectKey)
      }
    })
  )

  const errorMessages: string[] = []
  if (operationErrors.length > 0) {
    errorMessages.push(...operationErrors)
  }
  if (untrackFailures.length > 0) {
    errorMessages.push(
      `${untrackFailures.length} media row(s) now out of sync (R2 object deleted but DB untrack/decrement failed): ${untrackFailures.join(', ')}`
    )
  }

  if (errorMessages.length > 0) {
    throw new Error(errorMessages.join('; '))
  }
}


