// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { lazy } from "react"

// Route-level code splitting: pages off the hot path stay out of the initial bundle. The import functions are kept
// next to the lazy components so a route prefetch can start the very same chunk download early (a dynamic import
// of one module is shared, never fetched twice).
const importers = {
  trash: () => import("@/pages/content-trash").then((m) => ({ default: m.ContentTrashPage })),
  importJobDetail: () => import("@/pages/import-job-detail").then((m) => ({ default: m.ImportJobDetailPage })),
  testFields: () => import("@/pages/test-fields").then((m) => ({ default: m.TestFieldsPage })),
  widgetLab: () => import("@/pages/widget-lab").then((m) => ({ default: m.WidgetLabPage })),
  analytics: () => import("@/pages/analytics").then((m) => ({ default: m.AnalyticsPage })),
  createNew: () => import("@/pages/create-new").then((m) => ({ default: m.CreateNewPage })),
  scheduled: () => import("@/pages/scheduled").then((m) => ({ default: m.ScheduledPage })),
  drafts: () => import("@/pages/drafts-list").then((m) => ({ default: m.DraftsListPage })),
}

export const ContentTrashPage = lazy(importers.trash)
export const ImportJobDetailPage = lazy(importers.importJobDetail)
export const TestFieldsPage = lazy(importers.testFields)
export const WidgetLabPage = lazy(importers.widgetLab)
export const AnalyticsPage = lazy(importers.analytics)
export const CreateNewPage = lazy(importers.createNew)
export const ScheduledPage = lazy(importers.scheduled)
export const DraftsListPage = lazy(importers.drafts)

/** Starts downloading the code of the page behind `pathname` (router-relative), if it is a lazy one. */
export function preloadPageChunk(pathname: string): void {
  const importer = chunkFor(pathname)
  // A failed prefetch is not an error: the navigation will retry the import when it actually needs it.
  if (importer) void importer().catch(() => undefined)
}

function chunkFor(pathname: string): (() => Promise<unknown>) | undefined {
  if (pathname === "/analytics") return importers.analytics
  if (pathname === "/drafts") return importers.drafts
  if (pathname === "/scheduled") return importers.scheduled
  if (pathname === "/content/create-new") return importers.createNew
  if (/^\/content\/[^/]+\/trash$/.test(pathname)) return importers.trash
  return undefined
}
