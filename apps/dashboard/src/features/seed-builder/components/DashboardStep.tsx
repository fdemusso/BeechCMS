// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import type { Seed } from "@beechcms/core"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { SeedFormState } from "../hooks/use-seed-form"
import { DEFAULT_SIDEBAR_ORDER, existingGroups, sidebarGroupPreview } from "../lib/sidebar-preview"
import type { SeedRecordDTO } from "../api/seeds.api"
import { DisplayNamePicker } from "./DisplayNamePicker"
import { GroupPicker } from "./GroupPicker"
import { SidebarPreview } from "./SidebarPreview"
import { SwitchRow } from "./SwitchRow"
import { ViewsPicker } from "./ViewsPicker"

export interface DashboardStepProps {
  form: SeedFormState
  editRecord: SeedRecordDTO | null
  /** The stored content types: the sidebar groups in use, and the neighbours shown in the sidebar preview. */
  existingSeeds: readonly Seed[]
}

/** Step 3 — how the content type appears in the dashboard: display name, sidebar group and order, views. */
export function DashboardStep({ form, editRecord, existingSeeds }: DashboardStepProps) {
  const { t } = useTranslation()
  const { formData, setField } = form

  const defaultGroupLabel = t("sidebar.contents")
  const dashGroup = String(formData.dash_group ?? "")
  const dashOrder = typeof formData.dash_order === "number" ? formData.dash_order : undefined
  const groupPreview = sidebarGroupPreview(
    existingSeeds,
    {
      slug: editRecord?.slug ?? null,
      title: String(formData.label_plural || formData.label || "") || t("seedBuilder.editor.dashPreviewNew"),
      icon: String(formData.dash_icon ?? ""),
      description: String(formData.dash_description ?? "") || undefined,
      order: dashOrder,
    },
    dashGroup
  )
  const authorizedViews = (["gallery", "kanban"] as const).filter((view) => !!formData[`dash_view_${view}`])

  return (
    <>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <FieldGroup>
        {form.branches.length > 0 && (
          <Field>
            <FieldLabel htmlFor="sf-display">{t("seedBuilder.editor.displayNameAlias")}</FieldLabel>
            <DisplayNamePicker
              id="sf-display"
              branches={form.branches}
              value={form.displayNameAlias}
              onChange={(alias) => setField("display_name_alias", alias)}
            />
          </Field>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-4">
          <Field>
            <FieldLabel htmlFor="sf-group">{t("seedBuilder.editor.dashGroup")}</FieldLabel>
            <GroupPicker
              id="sf-group"
              value={dashGroup}
              groups={existingGroups(existingSeeds)}
              defaultLabel={defaultGroupLabel}
              onChange={(group) => setField("dash_group", group)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sf-order">{t("seedBuilder.editor.dashOrder")}</FieldLabel>
            <Input
              id="sf-order"
              data-enter-next=""
              type="number"
              min={0}
              aria-describedby="sf-order-hint"
              value={dashOrder ?? ""}
              placeholder={String(DEFAULT_SIDEBAR_ORDER)}
              onChange={(e) =>
                setField("dash_order", e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
          </Field>
        </div>
        <p id="sf-order-hint" className="-mt-2 text-xs text-muted-foreground">{t("seedBuilder.editor.dashOrderHint")}</p>
        <Field>
          <FieldLabel htmlFor="sf-description">{t("seedBuilder.editor.dashDescription")}</FieldLabel>
          <Input
            id="sf-description"
            data-enter-next=""
            value={String(formData.dash_description ?? "")}
            placeholder={t("seedBuilder.editor.dashDescriptionPlaceholder")}
            onChange={(e) => setField("dash_description", e.target.value)}
          />
        </Field>
        <SwitchRow
          id="sf-hidden"
          label={t("seedBuilder.editor.dashHidden")}
          checked={!!formData.dash_hidden}
          onCheckedChange={(checked) => setField("dash_hidden", checked)}
        />
      </FieldGroup>

      <SidebarPreview
        groupLabel={dashGroup || defaultGroupLabel}
        {...groupPreview}
        hidden={!!formData.dash_hidden}
      />
    </div>

    <div className="space-y-3 border-t pt-5">
      <h3 className="text-sm font-medium">{t("seedBuilder.editor.dashViewsSection")}</h3>
      <ViewsPicker
        selected={authorizedViews}
        onToggle={(view, checked) => setField(`dash_view_${view}`, checked)}
      />
    </div>
    </>
  )
}
