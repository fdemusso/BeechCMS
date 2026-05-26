// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export { RecentContentWidget } from "./recent-content-widget"
export type { RecentContentWidgetProps } from "./recent-content-widget"

export { QuickDraftWidget } from "./quick-draft-widget"
export type { QuickDraftWidgetProps } from "./quick-draft-widget"

export { PendingDraftsWidget } from "./pending-drafts-widget"
export type { PendingDraftsWidgetProps } from "./pending-drafts-widget"

export { PublicationStatsWidget } from "./publication-stats-widget"
export type { PublicationStatsWidgetProps } from "./publication-stats-widget"

export { SiteStatusWidget } from "./site-status-widget"
export type { SiteStatusWidgetProps } from "./site-status-widget"

export { StorageWidget } from "./storage-widget"
export type { StorageWidgetProps } from "./storage-widget"

export { MediaGalleryWidget } from "./media-gallery-widget"
export type { MediaGalleryWidgetProps } from "./media-gallery-widget"

export { ActivityFeedWidget } from "./activity-feed-widget"
export type { ActivityFeedWidgetProps } from "./activity-feed-widget"

export { SetupChecklistWidget } from "./setup-checklist-widget"
export type { SetupChecklistWidgetProps } from "./setup-checklist-widget"

export const WIDGET_META = {
  "recent-content":    { defaultSpan: { w: 4, h: 2 } },
  "quick-draft":       { defaultSpan: { w: 2, h: 1 } },
  "pending-drafts":    { defaultSpan: { w: 3, h: 2 } },
  "publication-stats": { defaultSpan: { w: 2, h: 1 } },
  "site-status":       { defaultSpan: { w: 2, h: 1 } },
  "storage":           { defaultSpan: { w: 2, h: 1 } },
  "media-gallery":     { defaultSpan: { w: 4, h: 2 } },
  "activity-feed":      { defaultSpan: { w: 4, h: 2 } },
  "setup-checklist":   { defaultSpan: { w: 8, h: 1 } },
} as const
