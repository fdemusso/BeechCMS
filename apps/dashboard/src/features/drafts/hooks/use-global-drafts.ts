// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useQuery } from "@tanstack/react-query"
import { fetchGlobalDrafts } from "../api/drafts.api"
import { GLOBAL_DRAFTS_QUERY_KEY } from "@/features/shared"

export { GLOBAL_DRAFTS_QUERY_KEY }

export function useGlobalDrafts() {
  return useQuery({
    queryKey: GLOBAL_DRAFTS_QUERY_KEY,
    queryFn: fetchGlobalDrafts,
    staleTime: 60 * 1000,
  })
}
