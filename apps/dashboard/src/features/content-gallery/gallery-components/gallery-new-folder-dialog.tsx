// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface GalleryNewFolderDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Chiamata con il nome già ripulito dagli spazi, mai vuoto. */
  readonly onConfirm: (name: string) => void
}

export function GalleryNewFolderDialog({ open, onOpenChange, onConfirm }: GalleryNewFolderDialogProps) {
  const [name, setName] = React.useState("")

  React.useEffect(() => {
    if (open) setName("")
  }, [open])

  const trimmed = name.trim()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nuova cartella</DialogTitle>
            <DialogDescription>
              Scrivi il nome della cartella, per esempio “Matrimonio”. Poi aggiungi la prima foto.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome della cartella"
            aria-label="Nome della cartella"
            className="h-11 text-base"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={!trimmed}>
              Crea e aggiungi foto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
