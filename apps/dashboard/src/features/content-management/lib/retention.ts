// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Seconds in a day — the unit of the effective `retentionDays` returned by the trash list. */
const SECONDS_PER_DAY = 86_400

/**
 * Whole days left before `deletedAt` falls outside the retention window.
 *
 * `retentionDays` is the effective retention from `GET /api/content/:slug/trash`
 * (`TrashListResponse.retentionDays`), not the seed's own declaration.
 * Mirrors the server-side predicate documented on `ContentRepository.findExpiredByRetention`
 * (`deleted_at + retentionDays * 86400 <= now`). Returns `null` for "no countdown": retention
 * unknown or `0`, or a row without a deletion timestamp. The caller renders `0` as "kept
 * indefinitely", because "0 days left" and "no policy" must never look alike.
 *
 * @param nowSeconds Unix seconds, supplied by the caller. Never read the clock in here.
 */
export function retentionRemainingDays(
  deletedAt: number | null | undefined,
  retentionDays: number | undefined,
  nowSeconds: number
): number | null {
  if (deletedAt == null || retentionDays == null || retentionDays <= 0) return null
  const expiresAt = deletedAt + retentionDays * SECONDS_PER_DAY
  return Math.max(0, Math.ceil((expiresAt - nowSeconds) / SECONDS_PER_DAY))
}
