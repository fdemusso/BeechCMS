// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { contentApi } from "../api/content.api"
import { trashApi } from "../api/trash.api"
import {
  invalidateTrashSurfaces,
  removeEntryFromCachedLists,
  restoreCachedLists,
  type ContentListSnapshot,
} from "../lib/trash-cache"

/** Lifetime of the single-delete "Undo" toast (feature brief §3). */
export const UNDO_DELETE_TOAST_MS = 5000

export interface DeleteWithUndoVariables {
  slug: string
  id: string
}

export interface DeleteWithUndo {
  /**
   * Soft-deletes now (`DELETE /api/content/:slug/:id`), removing the row from cached lists first.
   * Resolves `true` once the server confirmed, `false` on failure. Never rejects: the hook owns every toast.
   */
  deleteWithUndo: (variables: DeleteWithUndoVariables) => Promise<boolean>
  isDeleting: boolean
}

/**
 * Instant single delete with a per-deletion "Undo" toast.
 * The toast logic sits in mutation-level options, not in `mutate(vars, { onSuccess })`:
 * the latter is skipped when the caller (the entry editor) unmounts before the response.
 */
export function useDeleteWithUndo(): DeleteWithUndo {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { can } = usePermissions()

  const { mutateAsync, isPending } = useMutation<
    unknown,
    Error,
    DeleteWithUndoVariables,
    { snapshot: ContentListSnapshot }
  >({
    mutationFn: ({ slug, id }) => contentApi.delete(slug, id),
    onMutate: async ({ slug, id }) => ({
      snapshot: await removeEntryFromCachedLists(queryClient, slug, id),
    }),
    onError: (_error, _variables, context) => {
      if (context) restoreCachedLists(queryClient, context.snapshot)
      toast.error(t("content.undoDelete.deleteFailed"))
    },
    onSuccess: (_result, { slug, id }) => {
      // No toast `id`: a shared id would make one deletion's Undo replace another's.
      toast.success(t("content.undoDelete.trashed"), {
        duration: UNDO_DELETE_TOAST_MS,
        // `.undo-toast` (index.css) draws the countdown bar and styles the action like our outline Button.
        // Without `content:update` there is no Undo, so no countdown either.
        className: can("content:update", slug) ? "undo-toast" : undefined,
        style: { "--undo-duration": `${UNDO_DELETE_TOAST_MS}ms` } as React.CSSProperties,
        action: can("content:update", slug)
          ? {
              label: t("content.undoDelete.undo"),
              onClick: () => {
                trashApi.restore(slug, id).then(
                  () => {
                    invalidateTrashSurfaces(queryClient)
                    toast.success(t("content.trash.restored"))
                  },
                  () => toast.error(t("content.undoDelete.restoreFailed")),
                )
              },
            }
          : undefined,
      })
    },
    onSettled: () => invalidateTrashSurfaces(queryClient),
  })

  const deleteWithUndo = async (variables: DeleteWithUndoVariables) => {
    try {
      await mutateAsync(variables)
      return true
    } catch {
      return false
    }
  }

  return { deleteWithUndo, isDeleting: isPending }
}
