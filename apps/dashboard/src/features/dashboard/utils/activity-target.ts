// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { RecentActivity } from "../types/dashboard.types"

/**
 * What an activity row is about. `details` is a free-form JSON blob that the API stores exactly as
 * it received it, so a title or name is only used when it really is text: anything else would
 * reach React as an object child and throw while rendering the feed.
 */
export function activityTarget(activity: Pick<RecentActivity, "details" | "entity_slug" | "entity_id">): string {
  for (const key of ["title", "name"] as const) {
    const value = activity.details?.[key]
    if (typeof value === "string" && value) return value
  }
  return activity.entity_slug || activity.entity_id
}
