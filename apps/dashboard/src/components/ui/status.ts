// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export type Status = "published" | "draft" | "scheduled" | "failed" | "archived"

export type StatusTone = "live" | "warning" | "info" | "danger" | "neutral"

/** The colour role of each status (_config/design_system.html#components). Kept apart from the badge so that file only exports a component. */
export const STATUS_TONE: Record<Status, StatusTone> = {
  published: "live",
  draft: "warning",
  scheduled: "info",
  failed: "danger",
  archived: "neutral",
}

/** Whether a free-form status string is one of the statuses the badge knows. */
export function isStatus(value: string): value is Status {
  return Object.hasOwn(STATUS_TONE, value)
}
