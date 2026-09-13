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
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
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
    resolvedMode,
  } = useContentDeleteDialog(props)

  const { can } = usePermissions()
  const canDelete = can("content:delete", seed.slug)

  const titleKey = resolvedMode === "trash" ? "content.deleteDialog.trashTitle" : "content.deleteDialog.purgeTitle"
  const singleKey = resolvedMode === "trash" ? "content.deleteDialog.trashSingle" : "content.deleteDialog.purgeSingle"
  const multipleKey = resolvedMode === "trash" ? "content.deleteDialog.trashMultiple" : "content.deleteDialog.purgeMultiple"
  const confirmKey = resolvedMode === "trash" ? "content.deleteDialog.trashConfirm" : "content.deleteDialog.purgeConfirm"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>
            {entryCount <= 1
              ? t(singleKey, { type: seed.label })
              : t(multipleKey, { count: entryCount, type: seed.labelPlural ?? seed.label })}
            {previewIds.length > 0 && (
              <span className="mt-2 block font-mono text-xs text-muted-foreground">
                ID: {previewIds.join(", ")}
                {hasMore ? ", …" : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {resolvedMode === "purge" && (
          <p className="text-sm text-destructive">{t("content.deleteDialog.purgeWarning")}</p>
        )}
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
          {canDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? t("common.deleting") : t(confirmKey)}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled
                  >
                    {t("common.delete")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Manca il permesso 'content:delete'
              </TooltipContent>
            </Tooltip>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
