// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isAxiosError } from "axios"
import { api } from "@/lib/api"
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
  const { data } = await api.get<ContentView[]>(`/content/${slug}/views`)
  return data
}

export async function createContentView(slug: string, body: CreateContentViewBody): Promise<ContentView> {
  const { data } = await api.post<ContentView>(`/content/${slug}/views`, body)
  return data
}

export async function updateContentView(
  slug: string,
  viewId: string,
  body: UpdateContentViewBody
): Promise<ContentView> {
  const { data } = await api.patch<ContentView>(`/content/${slug}/views/${viewId}`, body)
  return data
}

/** Body is the full permutation of the visible view ids; answers the re-projected list. */
export async function reorderContentViews(slug: string, ids: readonly string[]): Promise<ContentView[]> {
  const { data } = await api.put<ContentView[]>(`/content/${slug}/views/order`, { ids })
  return data
}

export async function deleteContentView(slug: string, viewId: string): Promise<void> {
  await api.delete(`/content/${slug}/views/${viewId}`)
}

/** The RFC 9457 `type` of a failed views request (e.g. "content-view-last-table"), or null. */
export function viewProblemType(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const data: unknown = error.response?.data
  if (typeof data !== "object" || data === null || !("type" in data)) return null
  return typeof data.type === "string" ? data.type : null
}
