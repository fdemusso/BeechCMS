import * as React from "react"
import type { Seed } from "@beech/core"

export interface ContentDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: Seed
  entryIds: string[] | null
  onConfirm: () => Promise<void>
}

export function useContentDeleteDialog({
  entryIds,
  onConfirm,
  onOpenChange,
}: Pick<ContentDeleteDialogProps, "entryIds" | "onConfirm" | "onOpenChange">) {
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleConfirm = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      await onConfirm()
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore durante l'eliminazione"
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const entryCount = entryIds?.length ?? 0
  const previewIds = entryIds?.slice(0, 3) ?? []
  const hasMore = entryCount > previewIds.length

  return {
    isDeleting,
    error,
    handleConfirm,
    entryCount,
    previewIds,
    hasMore,
  }
}
