// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { rpc } from "@/lib/rpc"
import type { DraftSummary } from "../types/draft-summary"

export async function fetchGlobalDrafts(): Promise<DraftSummary[]> {
  const response = await rpc.api.content.drafts.$get()
  return response.json()
}

export async function publishDraft(seedSlug: string, id: string): Promise<void> {
  await rpc.api.content[":slug"][":id"].draft.publish.$post({ param: { slug: seedSlug, id } })
}

export async function discardDraft(seedSlug: string, id: string): Promise<void> {
  await rpc.api.content[":slug"][":id"].draft.$delete({ param: { slug: seedSlug, id } })
}
