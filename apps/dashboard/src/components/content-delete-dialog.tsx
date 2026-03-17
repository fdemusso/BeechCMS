import * as React from "react"
import type { Seed } from "@beech/core"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Props per il dialog di conferma eliminazione.
 * @property open - Stato apertura dialog
 * @property onOpenChange - Callback per cambiare stato
 * @property seed - Seed dello schema (per label nel messaggio)
 * @property entryId - ID dell'entry da eliminare
 * @property onConfirm - Callback alla conferma eliminazione
 */
interface ContentDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: Seed
  entryIds: string[] | null
  onConfirm: () => Promise<void>
}

export function ContentDeleteDialog({
  open,
  onOpenChange,
  seed,
  entryIds,
  onConfirm,
}: ContentDeleteDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Conferma eliminazione</DialogTitle>
          <DialogDescription>
            {entryCount <= 1
              ? `Sei sicuro di voler eliminare questa entry di tipo "${seed.label}"?`
              : `Sei sicuro di voler eliminare ${entryCount} entry di tipo "${seed.labelPlural ?? seed.label}"?`}
            {previewIds.length > 0 && (
              <span className="mt-2 block font-mono text-xs text-muted-foreground">
                ID: {previewIds.join(", ")}
                {hasMore ? ", …" : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Annulla
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Eliminazione..." : "Elimina"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
