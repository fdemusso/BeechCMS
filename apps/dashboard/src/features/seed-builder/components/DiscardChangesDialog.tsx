// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { SeedFormState } from "../hooks/use-seed-form"

export interface DiscardChangesDialogProps {
  form: SeedFormState
  onClose: () => void
}

/** Leaving with unsaved edits: closing the dialog, or navigating away. Escape and "Stay" both keep the edits. */
export function DiscardChangesDialog({ form, onClose }: DiscardChangesDialogProps) {
  const { t } = useTranslation()

  function stay() {
    form.setConfirmDiscardOpen(false)
    form.blocker.reset?.()
  }

  function leave() {
    form.setConfirmDiscardOpen(false)
    form.discardDraft()
    if (form.blocker.state === "blocked") form.blocker.proceed?.()
    else onClose()
  }

  return (
    <AlertDialog
      open={form.confirmDiscardOpen || form.blocker.state === "blocked"}
      onOpenChange={(next) => {
        if (!next) stay()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("content.editor.unsavedTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("content.editor.unsavedDesc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={stay}>{t("content.editor.stay")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={leave}>
            {t("content.editor.exitWithout")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
