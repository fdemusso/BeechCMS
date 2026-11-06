// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import type { SeedRecordDTO } from "../api/seeds.api"
import { HardDeleteDialog } from "./HardDeleteDialog"

interface PurgeSeedDialogProps {
  seed: SeedRecordDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Permanent removal of a soft-deleted seed: the same typed-slug confirmation as the editor's footer. */
export function PurgeSeedDialog({ seed, open, onOpenChange }: PurgeSeedDialogProps) {
  const { t } = useTranslation()
  return (
    <HardDeleteDialog
      seed={seed}
      open={open}
      onOpenChange={onOpenChange}
      title={seed ? t("seedBuilder.purge.title", { label: seed.definition.label }) : undefined}
      description={t("seedBuilder.purge.description")}
    />
  )
}
