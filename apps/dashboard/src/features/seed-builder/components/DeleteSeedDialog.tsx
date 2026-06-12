// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { toast } from "sonner"
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
import { useDeleteSeed } from "../hooks/use-seeds"
import type { SeedRecordDTO } from "../api/seeds.api"
import type { AxiosError } from "axios"

interface ProblemDetail {
  detail?: string
  title?: string
  referencedBy?: string[]
}

interface DeleteSeedDialogProps {
  seed: SeedRecordDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteSeedDialog({ seed, open, onOpenChange }: DeleteSeedDialogProps) {
  const { t } = useTranslation()
  const deleteMutation = useDeleteSeed()

  function handleDelete() {
    if (!seed) return
    deleteMutation.mutate(seed.slug, {
      onSuccess: () => {
        toast.success(t("seedBuilder.delete.successToast", { label: seed.definition.label }))
        onOpenChange(false)
      },
      onError: (err) => {
        const axErr = err as AxiosError<ProblemDetail>
        if (axErr.response?.status === 409) {
          const refs = axErr.response.data?.referencedBy
          toast.error(t("seedBuilder.delete.referenceConflict"), {
            description: refs?.length
              ? t("seedBuilder.delete.referencedBy", { seeds: refs.join(", ") })
              : axErr.response.data?.detail,
          })
        }
      },
    })
  }

  if (!seed) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("seedBuilder.delete.title", { label: seed.definition.label })}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>{t("seedBuilder.delete.description")}</p>
              <p className="font-medium">{t("seedBuilder.delete.dataRetained")}</p>
              <p className="text-muted-foreground">{t("seedBuilder.delete.dangerZoneHint")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? t("common.deleting") : t("seedBuilder.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
