// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import type { RowSelectionState } from "@tanstack/react-table"
import { useDeleteContent } from "./use-content-facets"

export function useContentListModals(slug: string | undefined) {
  const { id: entryId } = useParams<{ slug: string; id?: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const isCreatePath = location.pathname.endsWith("/create")
  const isEditPath = !!entryId && !isCreatePath
  const dialogOpen = isCreatePath || isEditPath

  const isDraftContext = !!(location.state as { isDraftContext?: boolean } | null)?.isDraftContext
  const createDefaults = (location.state as { defaultValues?: Record<string, unknown> } | null)?.defaultValues

  const handleDialogClose = React.useCallback(
    () => navigate(`/content/${slug}`),
    [navigate, slug]
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
  const [cardConfigOpen, setCardConfigOpen] = React.useState(false)

  const { mutateAsync: deleteContent } = useDeleteContent()

  const handleEdit = React.useCallback(
    (id: string) => {
      if (slug) navigate(`/content/${slug}/${id}`)
    },
    [slug, navigate]
  )

  const handleDelete = React.useCallback((id: string) => {
    setEntryIdsToDelete([id])
    setDeleteDialogOpen(true)
  }, [])

  const handleBulkDelete = React.useCallback((ids: string[]) => {
    const unique = Array.from(new Set(ids)).filter(Boolean)
    if (!unique.length) return
    setEntryIdsToDelete(unique)
    setDeleteDialogOpen(true)
  }, [])

  const handleCreate = React.useCallback(
    (defaultValues?: Record<string, unknown> | React.SyntheticEvent | Event) => {
      if (!slug) return

      const isEvent =
        defaultValues &&
        (defaultValues instanceof Event ||
          (typeof defaultValues === "object" &&
            ("nativeEvent" in defaultValues || "preventDefault" in defaultValues)))

      if (defaultValues && !isEvent) {
        navigate(`/content/${slug}/create`, {
          state: { defaultValues: defaultValues as Record<string, unknown> },
        })
      } else {
        navigate(`/content/${slug}/create`)
      }
    },
    [slug, navigate],
  )

  const handleConfirmDelete = React.useCallback(async () => {
    if (!slug || !entryIdsToDelete || entryIdsToDelete.length === 0) return

    const results = await Promise.allSettled(
      entryIdsToDelete.map((id) => deleteContent({ slug, id }))
    )
    const failures = results.filter((r) => r.status === "rejected").length
    if (failures > 0) {
      throw new Error(
        `Partial deletion: ${failures} out of ${entryIdsToDelete.length} failed`
      )
    }

    setRowSelection({})
  }, [slug, entryIdsToDelete, deleteContent])

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
    cardConfigOpen,
    setCardConfigOpen,
  }
}
