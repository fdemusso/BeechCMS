// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Trash2 } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useHardDeleteSeed } from "../hooks/use-seeds"
import type { SeedRecordDTO } from "../api/seeds.api"

export interface HardDeleteDialogProps {
  seed: SeedRecordDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the server has accepted the deletion (it finishes in the background). */
  onDeleted?: () => void
  /** Overrides the default title and description (the soft-deleted purge flow words them differently). */
  title?: string
  description?: string
}

/** Permanent removal of a content type: says what is lost, and asks for the slug before it goes ahead. */
export function HardDeleteDialog({ seed, open, onOpenChange, onDeleted, title, description }: HardDeleteDialogProps) {
  const { t } = useTranslation()
  if (!seed) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? t("seedBuilder.dangerZone.hardDelete.title", { label: seed.definition.label })}</DialogTitle>
          <DialogDescription>{description ?? t("seedBuilder.dangerZone.hardDelete.description")}</DialogDescription>
        </DialogHeader>
        {/* The typed slug lives in here: the content unmounts when the dialog closes, so every opening starts empty. */}
        <HardDeleteForm seed={seed} onOpenChange={onOpenChange} onDeleted={onDeleted} />
      </DialogContent>
    </Dialog>
  )
}

interface HardDeleteFormProps {
  seed: SeedRecordDTO
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

function HardDeleteForm({ seed, onOpenChange, onDeleted }: HardDeleteFormProps) {
  const { t } = useTranslation()
  const [confirm, setConfirm] = React.useState("")
  const hardDelete = useHardDeleteSeed()
  const slug = seed.slug

  async function handleDelete() {
    try {
      await hardDelete.mutateAsync({ slug, confirm })
      toast.success(t("seedBuilder.dangerZone.hardDelete.successToast", { slug }))
      onOpenChange(false)
      onDeleted?.()
    } catch { /* the hook shows the error toast */ }
  }

  return (
    <>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>{t("seedBuilder.dangerZone.hardDelete.impactEntries")}</li>
        <li>{t("seedBuilder.dangerZone.hardDelete.impactFields", { count: seed.definition.branches.length })}</li>
        <li>{t("seedBuilder.dangerZone.hardDelete.impactMedia")}</li>
      </ul>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (confirm === slug && !hardDelete.isPending) void handleDelete()
        }}
      >
        <Label htmlFor="hard-delete-confirm" className="text-xs">
          {t("seedBuilder.dangerZone.hardDelete.confirmLabel", { slug })}
        </Label>
        <div className="flex gap-2">
          <Input
            id="hard-delete-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("seedBuilder.dangerZone.hardDelete.confirmPlaceholder")}
            className="font-mono text-xs"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirm(slug)}
            aria-label={t("seedBuilder.dangerZone.hardDelete.fillSlug", { slug })}
            className="font-mono text-xs"
          >
            {slug}
          </Button>
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="destructive" disabled={confirm !== slug || hardDelete.isPending}>
            <Trash2 className="size-4" />
            {t("seedBuilder.dangerZone.hardDelete.button")}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
