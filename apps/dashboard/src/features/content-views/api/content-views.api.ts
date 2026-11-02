// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { rpc } from "@/lib/rpc"
import { problemCode } from "@/lib/http/api-error"
import type { ContentView, ContentViewConfig, DashboardView } from "@beechcms/core"

export interface CreateContentViewBody {
  type: DashboardView
  title?: string | null
}

/** Whole-config replacement on the server, never a deep merge. */
export interface UpdateContentViewBody {
  title?: string | null
  config?: ContentViewConfig
}

export async function fetchContentViews(slug: string): Promise<ContentView[]> {
  const response = await rpc.api.content[":slug"].views.$get({ param: { slug } })
  return response.json()
}

export async function createContentView(slug: string, body: CreateContentViewBody): Promise<ContentView> {
  const response = await rpc.api.content[":slug"].views.$post({ param: { slug }, json: body })
  return response.json()
}

export async function updateContentView(
  slug: string,
  viewId: string,
  body: UpdateContentViewBody
): Promise<ContentView> {
  const response = await rpc.api.content[":slug"].views[":viewId"].$patch({ param: { slug, viewId }, json: body })
  return response.json()
}

/** Body is the full permutation of the visible view ids; answers the re-projected list. */
export async function reorderContentViews(slug: string, ids: readonly string[]): Promise<ContentView[]> {
  const response = await rpc.api.content[":slug"].views.order.$put({ param: { slug }, json: { ids: [...ids] } })
  return response.json()
}

export async function deleteContentView(slug: string, viewId: string): Promise<void> {
  await rpc.api.content[":slug"].views[":viewId"].$delete({ param: { slug, viewId } })
}

/** The RFC 9457 `type` of a failed views request (e.g. "content-view-last-table"), or null. */
export function viewProblemType(error: unknown): string | null {
  return problemCode(error)
}
