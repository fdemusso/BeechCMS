// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export const pendingDraftBadgeClass =
  "border-status-warning/30 bg-status-warning-soft text-status-warning-foreground"

const HIDDEN_STATUSES: Record<string, boolean> = Object.assign(Object.create(null), {
  archived: true,
  draft: true,
})

export function shouldShowPendingDraftBadge(
  status: string | null | undefined,
  hasPendingDraft: unknown
): boolean {
  if (hasPendingDraft !== true) return false
  if (typeof status !== "string") return false
  const normalized = status.trim().toLowerCase()
  return !Object.hasOwn(HIDDEN_STATUSES, normalized)
}

