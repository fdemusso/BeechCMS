// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { QueryClient } from "@tanstack/react-query"
import { resolveActiveViewId, prefetchContentViews, toViewToolbarState } from "@/features/content-views"
import { buildContentListParams, prefetchContentFacets, prefetchContentList } from "@/features/content-management"
import { prefetchAutomations } from "@/features/automations"
import { prefetchDashboardLayout } from "@/features/dashboard"
import { prefetchSchema } from "@/features/shared"
import { hasAccessToken } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { getStoredActiveView } from "./active-view-storage"
import { preloadPageChunk } from "./lazy-pages"

const DEFAULT_PAGE_SIZE = 10 // ROWS_PER_PAGE in use-content-list-query
// /content/:slug paths that are not a content list.
const NOT_A_SLUG = new Set(["create-new", "import-jobs"])

/**
 * The content list page waits on a chain: schema, then the view (its saved filters/sort/page size are the list's
 * request), then the list. Started here, schema/views/facets/automations go out together and the list follows as
 * soon as the first two land, instead of each step waiting for the previous one to render.
 */
async function prefetchContentPage(client: QueryClient, slug: string, search: URLSearchParams): Promise<void> {
  void prefetchContentFacets(client, slug).catch(() => undefined)
  void prefetchAutomations(client, slug).catch(() => undefined)
  const [schema, views] = await Promise.allSettled([prefetchSchema(client), prefetchContentViews(client, slug)])
  // `?status=` becomes a toolbar filter, so the real list key differs: leave the list to the page.
  if (schema.status !== "fulfilled" || views.status !== "fulfilled" || search.has("status")) return

  const seed = schema.value.find((candidate) => candidate.slug === slug)
  const activeId = resolveActiveViewId(views.value, [null, search.get("view"), getStoredActiveView(slug)])
  const view = views.value.find((candidate) => candidate.id === activeId)
  if (!seed || !view) return

  const initial = toViewToolbarState(view.config, seed)
  await prefetchContentList(
    client,
    slug,
    buildContentListParams({
      pageIndex: 0,
      pageSize: initial.pageSize ?? DEFAULT_PAGE_SIZE,
      sorting: initial.sort ? [initial.sort] : [],
      filters: initial.filters ?? {},
    }),
  )
}

/**
 * Warms what the page at `to` (router-relative path, optional query) will ask for: its code and its first requests.
 * Fire and forget and never throws: the page still fetches for itself, this only makes it start earlier. Skips the
 * data until a session token exists (before that no request may go out).
 */
export function prefetchRoute(to: string): void {
  const { pathname, searchParams } = new URL(to, "http://prefetch.local")
  preloadPageChunk(pathname)
  if (!hasAccessToken()) return

  if (pathname === "/") {
    void prefetchDashboardLayout(queryClient).catch(() => undefined)
    return
  }
  const content = /^\/content\/([^/]+)$/.exec(pathname)
  if (content && !NOT_A_SLUG.has(content[1])) {
    void prefetchContentPage(queryClient, content[1], searchParams).catch(() => undefined)
  }
}
