import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useContentDeleteDialog, type ContentDeleteDialogProps } from "./use-content-delete-dialog"

export function ContentDeleteDialog(props: Readonly<ContentDeleteDialogProps>) {
  const { open, onOpenChange, seed } = props
  const {
    isDeleting,
    error,
    handleConfirm,
    entryCount,
    previewIds,
    hasMore,
  } = useContentDeleteDialog(props)

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
