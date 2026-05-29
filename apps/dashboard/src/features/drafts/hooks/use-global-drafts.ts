// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useQuery } from "@tanstack/react-query"
import { fetchGlobalDrafts } from "../api/drafts.api"

export const GLOBAL_DRAFTS_QUERY_KEY = ["global-drafts"] as const

export function useGlobalDrafts() {
  return useQuery({
    queryKey: GLOBAL_DRAFTS_QUERY_KEY,
    queryFn: fetchGlobalDrafts,
    staleTime: 60 * 1000,
  })
}
