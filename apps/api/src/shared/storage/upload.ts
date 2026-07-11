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
      const media = await mediaRepository.getByKey(key).catch(() => null)
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
