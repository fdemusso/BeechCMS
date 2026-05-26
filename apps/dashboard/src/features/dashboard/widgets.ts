// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public surface for the dashboard widget catalog.
 *
 * Heavy modules (charts, schema-aware tables, R2 media gallery) are
 * grouped here so the main features/dashboard barrel can stay
 * cheap to import for callers that only need DashboardPage or
 * useDashboardStats.
 */
export { SiteStatusWidget }       from "./components/widgets/site-status-widget"
export { StorageWidget }          from "./components/widgets/storage-widget"
export { PublicationStatsWidget } from "./components/widgets/publication-stats-widget"
export { QuickDraftWidget }       from "./components/widgets/quick-draft-widget"
export { RecentContentWidget }    from "./components/widgets/recent-content-widget"
export { PendingDraftsWidget }    from "./components/widgets/pending-drafts-widget"
export { MediaGalleryWidget }     from "./components/widgets/media-gallery-widget"
export { ActivityFeedWidget }     from "./components/widgets/activity-feed-widget"
// Add new public widgets here. Do NOT export internal helpers.
