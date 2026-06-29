// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export async function deleteR2Objects(
  c: { var: { bucket: any, mediaRepository: any, systemStatsRepository: any } },
  objectKeys: string[]
): Promise<void> {
  const { bucket, mediaRepository, systemStatsRepository } = c.var
  for (const key of objectKeys) {
    const media = await mediaRepository.getByKey(key).catch(() => null)
    const size = media?.size_bytes ?? 0
    try {
      await bucket.delete(key)
    } catch (err) {
      console.warn(`Failed to delete storage object: ${key}`, err)
    }
    try {
      await mediaRepository.untrack(key)
      if (size > 0) await systemStatsRepository.decrementStorage(size)
    } catch (err) {
      console.warn(`Failed to untrack media object: ${key}`, err)
    }
  }
}
