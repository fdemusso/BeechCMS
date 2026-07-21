// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export async function deleteR2Objects(
  c: { var: { bucket: any, mediaRepository: any, systemStatsRepository: any } },
  objectKeys: string[]
): Promise<void> {
  const { bucket, mediaRepository, systemStatsRepository } = c.var
  const untrackFailures: string[] = []

  await Promise.all(
    objectKeys.map(async (key) => {
      // Do not collapse a getByKey rejection (transient DB error) into the same
      // "not tracked" branch as a resolved null — the caller must be able to tell
      // a genuine orphan apart from a lookup failure, otherwise the R2 object is
      // silently skipped and leaked on every retry.
      let media
      try {
        media = await mediaRepository.getByKey(key)
      } catch (err) {
        throw new Error(`Media lookup failed for key, not deleted: ${key}`, { cause: err })
      }
      if (!media) {
        throw new Error(`Media object not found: ${key}`)
      }
      const size = media.size_bytes ?? 0

      // Let the bucket delete failure throw/bubble up so we do not untrack or decrement stats.
      await bucket.delete(key)

      try {
        await mediaRepository.untrack(key)
        if (size > 0) {
          await systemStatsRepository.decrementStorage(size)
        }
      } catch (err) {
        console.warn(`Failed to untrack media object: ${key}`, err)
        untrackFailures.push(key)
      }
    })
  )

  // Bucket deletes already succeeded for these keys — surface the drift instead of
  // swallowing it, so callers can log an actionable "N media rows now out of sync" warning.
  if (untrackFailures.length > 0) {
    throw new Error(
      `${untrackFailures.length} media row(s) now out of sync (R2 object deleted but DB untrack/decrement failed): ${untrackFailures.join(', ')}`
    )
  }
}
