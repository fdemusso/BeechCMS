// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { publishDraft } from "../api/drafts.api"
import { GLOBAL_DRAFTS_QUERY_KEY } from "./use-global-drafts"

export function usePublishDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ seedSlug, id }: { seedSlug: string; id: string }) =>
      publishDraft(seedSlug, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GLOBAL_DRAFTS_QUERY_KEY })
    },
  })
}
