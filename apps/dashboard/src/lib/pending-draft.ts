// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export const pendingDraftBadgeClass =
  "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-300"

export function shouldShowPendingDraftBadge(
  status: string | null | undefined,
  hasPendingDraft: unknown
): boolean {
  if (hasPendingDraft !== true) return false
  return status?.trim().toLowerCase() !== "archived"
}
