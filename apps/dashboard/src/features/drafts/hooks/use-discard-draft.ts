// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { discardDraft } from "../api/drafts.api"
import { GLOBAL_DRAFTS_QUERY_KEY } from "./use-global-drafts"

export function useDiscardDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ seedSlug, id }: { seedSlug: string; id: string }) =>
      discardDraft(seedSlug, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GLOBAL_DRAFTS_QUERY_KEY })
    },
  })
}
