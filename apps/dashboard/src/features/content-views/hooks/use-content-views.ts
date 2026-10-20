// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { ContentView } from "@beechcms/core"
import {
  createContentView,
  deleteContentView,
  fetchContentViews,
  reorderContentViews,
  updateContentView,
  viewProblemType,
  type CreateContentViewBody,
  type UpdateContentViewBody,
} from "../api/content-views.api"

export const CONTENT_VIEWS_QUERY_KEY = (slug: string) => ["content-views", slug] as const

export function useContentViews(slug: string | undefined) {
  return useQuery({
    queryKey: CONTENT_VIEWS_QUERY_KEY(slug ?? ""),
    queryFn: () => fetchContentViews(slug ?? ""),
    enabled: Boolean(slug),
    staleTime: 30_000,
  })
}

export function useCreateContentView(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateContentViewBody) => createContentView(slug, body),
    onSuccess: (created) => {
      queryClient.setQueryData<ContentView[]>(CONTENT_VIEWS_QUERY_KEY(slug), (prev) => [...(prev ?? []), created])
    },
  })
}

interface UpdateContentViewVariables {
  viewId: string
  body: UpdateContentViewBody
}

/**
 * Optimistic and cache-authoritative: the workspace is remounted on every view switch and
 * hydrates from this cache, so it must already hold the config the previous mount just wrote,
 * even while the PATCH is in flight. The server response is not written back. Its only
 * difference is the Branch-ID cleanup, which hydration repeats anyway.
 */
export function useUpdateContentView(slug: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const queryKey = CONTENT_VIEWS_QUERY_KEY(slug)
  return useMutation({
    mutationFn: ({ viewId, body }: UpdateContentViewVariables) => updateContentView(slug, viewId, body),
    onMutate: async ({ viewId, body }: UpdateContentViewVariables) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData<ContentView[]>(queryKey, (prev) =>
        prev?.map((view) =>
          view.id !== viewId
            ? view
            : {
                ...view,
                ...(body.title !== undefined ? { title: body.title } : {}),
                ...(body.config !== undefined ? { config: body.config } : {}),
              }
        )
      )
    },
    // Options on useMutation (not on mutate()) still run after the caller unmounts, which is
    // exactly when the autosave flush fires.
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey })
      // A view deleted while its last autosave was pending: nothing to save, nothing to report.
      if (viewProblemType(error) === "content-view-not-found") return
      toast.error(t("content.views.errors.saveFailed"))
    },
  })
}

/**
 * mutate(orderedIds). Optimistic and cache-authoritative, like useUpdateContentView: the response
 * is not written back, for the same reason its doc comment gives — it could carry configs older
 * than an in-flight autosave.
 */
export function useReorderContentViews(slug: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const queryKey = CONTENT_VIEWS_QUERY_KEY(slug)
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderContentViews(slug, orderedIds),
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData<ContentView[]>(queryKey, (prev) => {
        if (!prev) return prev
        const byId = new Map(prev.map((view) => [view.id, view]))
        const orderedIdSet = new Set(orderedIds)
        const ordered = orderedIds
          .map((id) => byId.get(id))
          .filter((view): view is ContentView => view !== undefined)
        const missing = prev.filter((view) => !orderedIdSet.has(view.id))
        return [...ordered, ...missing].map((view, index) => ({ ...view, position: index }))
      })
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey })
      toast.error(t("content.views.errors.reorderFailed"))
    },
  })
}

export function useDeleteContentView(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (viewId: string) => deleteContentView(slug, viewId),
    onSuccess: (_result, viewId) => {
      queryClient.setQueryData<ContentView[]>(CONTENT_VIEWS_QUERY_KEY(slug), (prev) =>
        prev?.filter((view) => view.id !== viewId)
      )
    },
  })
}
