// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import type { Branch, Seed } from "@beechcms/core"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FieldEditRepeater } from "./repeater"

/**
 * Properties for the {@link RelationOptionsForm} component.
 */
export interface RelationOptionsFormProps {
  /** The current branch definition containing relation metadata. */
  branch: Branch
  /** List of active seeds available to choose as target for the relation. */
  activeSeedsForRelation: Seed[]
  /** Callback triggered when any relation option value changes. */
  onChange: (updated: Branch) => void
}

/**
 * Form fragment for editing a relation branch settings.
 */
export function RelationOptionsForm({
  branch,
  activeSeedsForRelation,
  onChange,
}: RelationOptionsFormProps) {
  const { t } = useTranslation()

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    onChange({ ...branch, [key]: value })
  }

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs font-medium">{t("seedBuilder.branchEditor.relationOptions")}</p>
      <div className="space-y-1">
        <Label className="text-xs">{t("seedBuilder.branchEditor.targetSeed")}</Label>
        <Select value={branch.targetSeed ?? ""} onValueChange={v => set("targetSeed", v)}>
          <SelectTrigger>
            <SelectValue placeholder={t("seedBuilder.branchEditor.targetSeedPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {activeSeedsForRelation.map(s => (
              <SelectItem key={s.slug} value={s.slug}>{s.labelPlural ?? s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`multiple-${branch.id}`}
          checked={!!branch.multiple}
          onCheckedChange={v => set("multiple", !!v)}
        />
        <Label htmlFor={`multiple-${branch.id}`} className="text-xs">{t("seedBuilder.branchEditor.multiple")}</Label>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("seedBuilder.branchEditor.onDelete")}</Label>
        <Select
          value={branch.onDelete ?? "SET NULL"}
          onValueChange={v => set("onDelete", v as Branch["onDelete"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CASCADE">{t("seedBuilder.branchEditor.onDeleteCascade")}</SelectItem>
            <SelectItem value="RESTRICT">{t("seedBuilder.branchEditor.onDeleteRestrict")}</SelectItem>
            <SelectItem value="SET NULL" disabled={!!branch.multiple}>{t("seedBuilder.branchEditor.onDeleteSetNull")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/**
 * Properties for the {@link NumberOptionsForm} component.
 */
export interface NumberOptionsFormProps {
  /** The current branch definition containing number metadata. */
  branch: Branch
  /** Callback triggered when any number option value changes. */
  onChange: (updated: Branch) => void
}

/**
 * Form fragment for editing a number branch configuration.
 */
export function NumberOptionsForm({ branch, onChange }: NumberOptionsFormProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs font-medium">{t("seedBuilder.branchEditor.numberOptions")}</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("seedBuilder.branchEditor.min")}</Label>
          <Input
            type="number"
            value={branch.numberOptions?.min ?? ""}
            onChange={e => onChange({ ...branch, numberOptions: { ...branch.numberOptions, min: e.target.value ? +e.target.value : undefined } })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("seedBuilder.branchEditor.max")}</Label>
          <Input
            type="number"
            value={branch.numberOptions?.max ?? ""}
            onChange={e => onChange({ ...branch, numberOptions: { ...branch.numberOptions, max: e.target.value ? +e.target.value : undefined } })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("seedBuilder.branchEditor.step")}</Label>
          <Input
            type="number"
            value={branch.numberOptions?.step ?? ""}
            onChange={e => onChange({ ...branch, numberOptions: { ...branch.numberOptions, step: e.target.value ? +e.target.value : undefined } })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("seedBuilder.branchEditor.control")}</Label>
        <Select
          value={branch.numberOptions?.control ?? "input"}
          onValueChange={v => onChange({ ...branch, numberOptions: { ...branch.numberOptions, control: v as "input" | "slider" | "rating" | "stepper" } })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["input", "slider", "rating", "stepper"].map(c => (
              <SelectItem key={c} value={c}>{t(`seedBuilder.branchEditor.control_${c}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/**
 * Properties for the {@link FileOptionsForm} component.
 */
export interface FileOptionsFormProps {
  /** The current branch definition containing file upload metadata. */
  branch: Branch
  /** Callback triggered when any file option value changes. */
  onChange: (updated: Branch) => void
}

/**
 * Form fragment for editing a file field branch configuration.
 */
export function FileOptionsForm({ branch, onChange }: FileOptionsFormProps) {
  const { t } = useTranslation()

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    onChange({ ...branch, [key]: value })
  }

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs font-medium">{t("seedBuilder.branchEditor.fileOptions")}</p>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`file-multiple-${branch.id}`}
          checked={!!branch.multiple}
          onCheckedChange={v => set("multiple", !!v)}
        />
        <Label htmlFor={`file-multiple-${branch.id}`} className="text-xs">{t("seedBuilder.branchEditor.multiple")}</Label>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("seedBuilder.branchEditor.fileAccept")}</Label>
        <Select
          value={branch.fileOptions?.accept ?? "any"}
          onValueChange={v => onChange({ ...branch, fileOptions: { ...branch.fileOptions, accept: v as "image" | "document" | "any" } })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["any", "image", "document"].map(a => (
              <SelectItem key={a} value={a}>{t(`seedBuilder.branchEditor.fileAccept_${a}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/**
 * Properties for the {@link RepeaterOptionsForm} component.
 */
export interface RepeaterOptionsFormProps {
  /** The current branch definition containing repeater field layout. */
  branch: Branch
  /** Callback triggered when any repeater option or subfield layout changes. */
  onChange: (updated: Branch) => void
  /** If true, indicates this repeater is a nested subfield (depth restricted). */
  subField?: boolean
}

/**
 * Form fragment for editing min/max limitations and child fields for repeaters.
 */
export function RepeaterOptionsForm({ branch, onChange, subField }: RepeaterOptionsFormProps) {
  const { t } = useTranslation()

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    onChange({ ...branch, [key]: value })
  }

  if (subField) return null

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs font-medium">{t("seedBuilder.branchEditor.repeaterFields")}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("seedBuilder.branchEditor.minItems")}</Label>
          <Input
            type="number"
            min={0}
            value={branch.minItems ?? ""}
            onChange={e => set("minItems", e.target.value ? +e.target.value : undefined)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("seedBuilder.branchEditor.maxItems")}</Label>
          <Input
            type="number"
            min={0}
            value={branch.maxItems ?? ""}
            onChange={e => set("maxItems", e.target.value ? +e.target.value : undefined)}
          />
        </div>
      </div>
      <FieldEditRepeater
        branch={{
          id: `${branch.id}_subfields`,
          alias: "fields",
          label: "",
          type: "repeater",
          repeater: {
            itemKind: "branch",
            itemLabel: t("seedBuilder.branchEditor.addSubField"),
            branchItemContext: { activeSeedsForRelation: [], subField: true },
          },
        } as unknown as Branch}
        value={branch.fields ?? []}
        onChange={(fields) => set("fields", fields as Branch[])}
      />
    </div>
  )
}

/**
 * Properties for the {@link TagsOptionsForm} component.
 */
export interface TagsOptionsFormProps {
  /** The current branch definition containing tags or predefined JSON options. */
  branch: Branch
  /** Callback triggered when options array changes. */
  onChange: (updated: Branch) => void
}

/**
 * Form fragment for configuring preset values on tags or json fields.
 */
export function TagsOptionsForm({ branch, onChange }: TagsOptionsFormProps) {
  const { t } = useTranslation()

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    onChange({ ...branch, [key]: value })
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs">{t("seedBuilder.branchEditor.options")}</Label>
      <Input
        value={(branch.options ?? []).join(",")}
        onChange={e => set("options", e.target.value ? e.target.value.split(",").map(s => s.trim()) : [])}
        placeholder={t("seedBuilder.branchEditor.optionsPlaceholder")}
      />
      <p className="text-xs text-muted-foreground">{t("seedBuilder.branchEditor.optionsHint")}</p>
    </div>
  )
}

/**
 * Properties for the {@link PoliciesOptionsForm} component.
 */
export interface PoliciesOptionsFormProps {
  /** The current branch definition containing access policies. */
  branch: Branch
  /** Callback triggered when policy settings change. */
  onChange: (updated: Branch) => void
  /** If true, policies editing is skipped (subfields do not map directly to SQL search/sort). */
  subField?: boolean
}

/**
 * Form fragment for configuring CRUD and search index policies on top-level branch fields.
 */
export function PoliciesOptionsForm({ branch, onChange, subField }: PoliciesOptionsFormProps) {
  const { t } = useTranslation()

  function setPolicy(key: keyof NonNullable<Branch["policies"]>, value: boolean | string) {
    onChange({ ...branch, policies: { ...branch.policies, [key]: value } })
  }

  if (subField) return null

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs font-medium">{t("seedBuilder.branchEditor.policies")}</p>
      <div className="grid grid-cols-2 gap-2">
        {(["search", "filter", "sort", "public"] as const).map(pol => (
          <div key={pol} className="flex items-center gap-2">
            <Checkbox
              id={`policy-${branch.id}-${pol}`}
              checked={branch.policies?.[pol] !== false}
              onCheckedChange={v => setPolicy(pol, !!v)}
            />
            <Label htmlFor={`policy-${branch.id}-${pol}`} className="text-xs">{t(`seedBuilder.policies.${pol}`)}</Label>
          </div>
        ))}
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">{t("seedBuilder.policies.visibility")}</Label>
          <Select
            value={branch.policies?.visibility ?? "full"}
            onValueChange={v => setPolicy("visibility", v)}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["full", "masked", "hidden"].map(vis => (
                <SelectItem key={vis} value={vis} className="text-xs">{t(`seedBuilder.policies.visibility_${vis}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
