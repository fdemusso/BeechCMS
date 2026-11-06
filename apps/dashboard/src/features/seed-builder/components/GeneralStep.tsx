// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Globe } from "@/components/icons"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { IconPicker } from "@/components/ui/icon-picker"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import type { SeedFormState } from "../hooks/use-seed-form"
import { SwitchRow } from "./SwitchRow"

/** Public API flags, in the order they are shown: form-data alias and the i18n key of their label/hint. */
const PUBLIC_FLAGS = [
  { alias: "allow_public_read", key: "allowPublicRead" },
  { alias: "allow_public_post", key: "allowPublicPost" },
  { alias: "allow_public_edit", key: "allowPublicEdit" },
] as const

export interface GeneralStepProps {
  form: SeedFormState
  /** The name input: the dialog focuses it when it opens to create a content type. */
  labelInputRef: React.Ref<HTMLInputElement>
}

/** Step 1 — identity (name, slug, icon), drafts, and the anonymous access flags. */
export function GeneralStep({ form, labelInputRef }: GeneralStepProps) {
  const { t } = useTranslation()
  const { formData, isCreate, setField } = form
  const label = String(formData.label ?? "")
  const slug = String(formData.slug ?? "")

  return (
    <>
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="sf-label">{t("seedBuilder.editor.label")}</FieldLabel>
        <div className="flex items-center gap-2">
          <IconPicker
            value={String(formData.dash_icon ?? "")}
            onChange={(icon) => setField("dash_icon", icon)}
            fallback="Folder"
            ariaLabel={t("seedBuilder.editor.selectIcon")}
            searchPlaceholder={t("seedBuilder.editor.searchIcons")}
            emptyLabel={t("seedBuilder.editor.noIconsFound")}
          />
          <Input
            id="sf-label"
            ref={labelInputRef}
            data-enter-next=""
            value={label}
            placeholder={t("seedBuilder.editor.labelPlaceholder")}
            onChange={(e) => form.setLabel(e.target.value)}
            className="flex-1"
          />
        </div>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="sf-slug">{t("seedBuilder.editor.slug")}</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>content_</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="sf-slug"
              data-enter-next=""
              value={slug}
              readOnly={!isCreate}
              aria-invalid={form.slugTaken || undefined}
              aria-describedby={form.slugTaken ? "sf-slug-hint sf-slug-error" : "sf-slug-hint"}
              onChange={(e) => form.setSlug(e.target.value)}
              className="pl-0"
            />
          </InputGroup>
          {form.slugTaken && <FieldError id="sf-slug-error">{t("seedBuilder.editor.slugTaken")}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="sf-plural">{t("seedBuilder.editor.labelPlural")}</FieldLabel>
          <Input
            id="sf-plural"
            data-enter-next=""
            value={String(formData.label_plural ?? "")}
            placeholder={label || t("seedBuilder.editor.labelPluralPlaceholder")}
            onChange={(e) => setField("label_plural", e.target.value)}
          />
        </Field>
      </div>
      <FieldDescription id="sf-slug-hint">{t("seedBuilder.editor.hints.slug")}</FieldDescription>
    </FieldGroup>

    <SwitchRow
      id="sf-allow_drafts"
      label={t("seedBuilder.editor.allowDrafts")}
      hint={t("seedBuilder.editor.hints.allowDrafts")}
      checked={!!formData.allow_drafts}
      onCheckedChange={(checked) => setField("allow_drafts", checked)}
    />

    {/* Anonymous visitors: a layer apart from roles (RBAC) */}
    <section aria-labelledby="sf-public-title" className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="space-y-1">
        <h3 id="sf-public-title" className="flex items-center gap-2 text-sm font-medium">
          <Globe aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {t("seedBuilder.editor.publicAccessTitle")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("seedBuilder.editor.publicAccessDescription")}</p>
      </div>
      <div className="space-y-3 border-t pt-3">
        {PUBLIC_FLAGS.map(({ alias, key }) => (
          <SwitchRow
            key={alias}
            id={`sf-${alias}`}
            label={t(`seedBuilder.editor.${key}`)}
            hint={t(`seedBuilder.editor.hints.${key}`)}
            checked={!!formData[alias]}
            onCheckedChange={(checked) => setField(alias, checked)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("seedBuilder.editor.publicAccessRbacNote")}</p>
    </section>
    </>
  )
}
