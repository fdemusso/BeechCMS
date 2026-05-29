// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { api } from "@/lib/api"
import type { DraftSummary } from "../types/draft-summary"

export async function fetchGlobalDrafts(): Promise<DraftSummary[]> {
  const { data } = await api.get<DraftSummary[]>("/content/drafts")
  return data
}

export async function publishDraft(seedSlug: string, id: string): Promise<void> {
  await api.post(`/content/${seedSlug}/${id}/draft/publish`)
}

export async function discardDraft(seedSlug: string, id: string): Promise<void> {
  await api.delete(`/content/${seedSlug}/${id}/draft`)
}
