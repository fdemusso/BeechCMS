// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation()
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
            <DialogTitle>{t("gallery.folders.newFolder")}</DialogTitle>
            <DialogDescription>
              {t("gallery.folders.newFolderDescription")}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("gallery.folders.namePlaceholder")}
            aria-label={t("gallery.folders.namePlaceholder")}
            className="h-11 text-base"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!trimmed}>
              {t("gallery.folders.createAndAddPhoto")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
