// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { toast } from "sonner"
import type { RowSelectionState } from "@tanstack/react-table"
import { useDeleteContent } from "./use-content-facets"
import { useDeleteWithUndo } from "./use-delete-with-undo"

export function useContentListModals(slug: string | undefined) {
  const { t } = useTranslation()
  const { id: entryId } = useParams<{ slug: string; id?: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const isCreatePath = location.pathname.endsWith("/create")
  const isEditPath = !!entryId && !isCreatePath
  const dialogOpen = isCreatePath || isEditPath

  const isDraftContext = !!(location.state as { isDraftContext?: boolean } | null)?.isDraftContext
  const createDefaults = (location.state as { defaultValues?: Record<string, unknown> } | null)?.defaultValues

  const handleDialogClose = React.useCallback(
    // Conserva i parametri (es. la cartella aperta nella galleria) al ritorno dal modulo.
    () => navigate(`/content/${slug}${location.search}`),
    [navigate, slug, location.search]
  )

  const [target, setTarget] = React.useState<{
    schemaSlug: string
    entryId: string | undefined
    isDraftContext: boolean
  } | null>(null)

  React.useEffect(() => {
    if (dialogOpen && slug) {
      setTarget({ schemaSlug: slug, entryId: isCreatePath ? undefined : entryId, isDraftContext })
    }
  }, [dialogOpen, slug, entryId, isCreatePath, isDraftContext])

  React.useEffect(() => {
    if (!dialogOpen && target) {
      const id = window.setTimeout(() => setTarget(null), 150)
      return () => window.clearTimeout(id)
    }
  }, [dialogOpen, target])

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [entryIdsToDelete, setEntryIdsToDelete] = React.useState<string[] | null>(null)
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false)
  const [automationPanelOpen, setAutomationPanelOpen] = React.useState(false)
  const [importWizardOpen, setImportWizardOpen] = React.useState(false)

  const { mutateAsync: deleteContent } = useDeleteContent()
  const { deleteWithUndo } = useDeleteWithUndo()

  const handleEdit = React.useCallback(
    (id: string) => {
      if (slug) navigate(`/content/${slug}/${id}${location.search}`)
    },
    [slug, navigate, location.search]
  )

  const handleDelete = React.useCallback(
    (id: string) => {
      if (!slug) return
      void deleteWithUndo({ slug, id })
      setRowSelection((selection) => {
        const { [id]: _removed, ...rest } = selection
        return rest
      })
    },
    [slug, deleteWithUndo]
  )

  const handleBulkDelete = React.useCallback(
    (ids: string[]) => {
      const unique = Array.from(new Set(ids)).filter(Boolean)
      if (!unique.length) return
      // The Del key routes one focused row through here; a single deletion is always instant.
      if (unique.length === 1) {
        handleDelete(unique[0])
        return
      }
      setEntryIdsToDelete(unique)
      setDeleteDialogOpen(true)
    },
    [handleDelete]
  )

  const handleCreate = React.useCallback(
    (defaultValues?: Record<string, unknown> | React.SyntheticEvent | Event) => {
      if (!slug) return

      const isEvent =
        defaultValues &&
        (defaultValues instanceof Event ||
          (typeof defaultValues === "object" &&
            ("nativeEvent" in defaultValues || "preventDefault" in defaultValues)))

      if (defaultValues && !isEvent) {
        navigate(`/content/${slug}/create${location.search}`, {
          state: { defaultValues: defaultValues as Record<string, unknown> },
        })
      } else {
        navigate(`/content/${slug}/create${location.search}`)
      }
    },
    [slug, navigate, location.search],
  )

  const handleConfirmDelete = React.useCallback(async () => {
    if (!slug || !entryIdsToDelete || entryIdsToDelete.length === 0) return

    const results = await Promise.allSettled(
      entryIdsToDelete.map((id) => deleteContent({ slug, id }))
    )
    const failedIds = entryIdsToDelete.filter((_, index) => results[index].status === "rejected")

    if (failedIds.length === 0) {
      setRowSelection({})
      toast.success(t("content.deleteDialog.bulkTrashed", { count: entryIdsToDelete.length }))
      return
    }

    const failedIdSet = new Set(failedIds)
    setRowSelection((selection) =>
      Object.fromEntries(Object.entries(selection).filter(([id]) => failedIdSet.has(id)))
    )
    setEntryIdsToDelete(failedIds)
    throw new Error(
      t("content.deleteDialog.bulkPartialFailure", {
        count: failedIds.length,
        total: entryIdsToDelete.length,
      })
    )
  }, [slug, entryIdsToDelete, deleteContent, t])

  const handleBulkEdit = React.useCallback((ids: string[]) => {
    const unique = Array.from(new Set(ids)).filter(Boolean)
    if (!unique.length) return
    setRowSelection(Object.fromEntries(unique.map((id) => [id, true])))
    setBulkEditOpen(true)
  }, [])

  const selectedIds = React.useMemo(() => {
    return Object.keys(rowSelection).filter((id) => rowSelection[id])
  }, [rowSelection])

  return {
    dialogOpen,
    target,
    createDefaults,
    handleDialogClose,
    handleCreate,
    handleEdit,
    handleDelete,
    handleBulkDelete,
    handleBulkEdit,
    handleConfirmDelete,
    rowSelection,
    setRowSelection,
    selectedIds,
    deleteDialogOpen,
    setDeleteDialogOpen,
    entryIdsToDelete,
    bulkEditOpen,
    setBulkEditOpen,
    automationPanelOpen,
    setAutomationPanelOpen,
    importWizardOpen,
    setImportWizardOpen,
  }
}
