// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// The import functions of the lazy pages, kept next to what starts them early: a route prefetch downloads the very same
// chunk the lazy component will need (a dynamic import of one module is shared, never fetched twice). The lazy
// components themselves are in lazy-pages.tsx.
export const importers = {
  trash: () => import("@/pages/content-trash").then((m) => ({ default: m.ContentTrashPage })),
  importJobDetail: () => import("@/pages/import-job-detail").then((m) => ({ default: m.ImportJobDetailPage })),
  testFields: () => import("@/pages/test-fields").then((m) => ({ default: m.TestFieldsPage })),
  widgetLab: () => import("@/pages/widget-lab").then((m) => ({ default: m.WidgetLabPage })),
  analytics: () => import("@/pages/analytics").then((m) => ({ default: m.AnalyticsPage })),
  createNew: () => import("@/pages/create-new").then((m) => ({ default: m.CreateNewPage })),
  scheduled: () => import("@/pages/scheduled").then((m) => ({ default: m.ScheduledPage })),
  schema: () => import("@/pages/schema").then((m) => ({ default: m.SchemaPage })),
  drafts: () => import("@/pages/drafts-list").then((m) => ({ default: m.DraftsListPage })),
}

/** Starts downloading the code of the page behind `pathname` (router-relative), if it is a lazy one. */
export function preloadPageChunk(pathname: string): void {
  const importer = chunkFor(pathname)
  // A failed prefetch is not an error: the navigation will retry the import when it actually needs it.
  if (importer) void importer().catch(() => undefined)
}

function chunkFor(pathname: string): (() => Promise<unknown>) | undefined {
  if (pathname === "/analytics") return importers.analytics
  if (pathname === "/schema") return importers.schema
  if (pathname === "/drafts") return importers.drafts
  if (pathname === "/scheduled") return importers.scheduled
  if (pathname === "/content/create-new") return importers.createNew
  if (/^\/content\/[^/]+\/trash$/.test(pathname)) return importers.trash
  return undefined
}
