// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Trash2 } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { MOD_KEY_LABEL } from "@/lib/platform"
import { SEED_FORM_STEPS, type SeedFormState } from "../hooks/use-seed-form"
import type { SeedRecordDTO } from "../api/seeds.api"

export interface SeedFormFooterProps {
  form: SeedFormState
  editRecord: SeedRecordDTO | null
  onDelete: () => void
}

const FOOTER_CLASS = "flex flex-shrink-0 items-center justify-between gap-3 border-t px-6 py-4"

/** The Danger zone footer is the red delete button; every other tab has Back / Next / Save. */
export function SeedFormFooter({ form, editRecord, onDelete }: SeedFormFooterProps) {
  const { t } = useTranslation()
  const { isCreate } = form

  if (form.step === "danger" && editRecord) {
    return (
      <footer className={FOOTER_CLASS}>
        <p id="sf-delete-hint" className="text-xs text-muted-foreground">
          {editRecord.source === "code"
            ? t("seedBuilder.dangerZone.hardDelete.manifestHint")
            : t("seedBuilder.dangerZone.hardDelete.footerHint")}
        </p>
        <Button
          type="button"
          variant="destructive"
          disabled={editRecord.source === "code"}
          aria-describedby="sf-delete-hint"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
          {t("seedBuilder.dangerZone.hardDelete.footerButton")}
        </Button>
      </footer>
    )
  }

  const advancing = isCreate && !form.isLastStep
  return (
    <footer className={FOOTER_CLASS}>
      <div className="flex items-center gap-3">
        {isCreate && form.step !== SEED_FORM_STEPS[0] && (
          <Button type="button" variant="outline" onClick={form.goBack}>
            {t("seedBuilder.editor.back")}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <KbdGroup>
            <Kbd>{MOD_KEY_LABEL}</Kbd>
            <span>+</span>
            <Kbd>↵</Kbd>
          </KbdGroup>
          {advancing ? t("seedBuilder.editor.nextShortcut") : t("seedBuilder.editor.saveShortcut")}
        </span>
        {advancing ? (
          <Button type="submit" disabled={!form.canAdvance}>
            {t("seedBuilder.editor.next")}
          </Button>
        ) : (
          <Button type="submit" disabled={!form.canSubmit}>
            {isCreate ? t("common.create") : t("common.save")}
          </Button>
        )}
      </div>
    </footer>
  )
}
