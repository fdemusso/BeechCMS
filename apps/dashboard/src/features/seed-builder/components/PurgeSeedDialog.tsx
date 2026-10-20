// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { SeedRecordDTO } from "../api/seeds.api"
import { HardDeleteSection } from "./SeedDangerZone"

interface PurgeSeedDialogProps {
  seed: SeedRecordDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Permanent removal of a soft-deleted seed, reusing the Danger Zone's typed-slug confirmation. */
export function PurgeSeedDialog({ seed, open, onOpenChange }: PurgeSeedDialogProps) {
  const { t } = useTranslation()
  if (!seed) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("seedBuilder.purge.title", { label: seed.definition.label })}</DialogTitle>
          <DialogDescription>{t("seedBuilder.purge.description")}</DialogDescription>
        </DialogHeader>
        <HardDeleteSection record={seed} onDeleted={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
