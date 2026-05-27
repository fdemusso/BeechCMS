// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { contentApi, type BulkUpdateBody } from "../api/content.api"
import { CONTENT_QUERY_KEYS } from "../consts/content.keys"
import { BACKREF_QUERY_KEY } from "@/features/backrefs"

export function useBulkUpdate(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: BulkUpdateBody) => contentApi.bulkUpdate(slug, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
      for (const id of variables.ids) {
        queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.detail(slug, id) })
      }
      const hasRelationField = true // always invalidate; caller knows the fields
      void hasRelationField
      queryClient.invalidateQueries({ queryKey: [BACKREF_QUERY_KEY] })
    },
  })
}
