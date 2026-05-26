// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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
import { useContentDeleteDialog, type ContentDeleteDialogProps } from "./use-content-delete-dialog"

export function ContentDeleteDialog(props: Readonly<ContentDeleteDialogProps>) {
  const { t } = useTranslation()
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
          <DialogTitle>{t("content.deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {entryCount <= 1
              ? t("content.deleteDialog.single", { type: seed.label })
              : t("content.deleteDialog.multiple", { count: entryCount, type: seed.labelPlural ?? seed.label })}
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
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
