// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { resolvePolicies, type Branch, type DataClassification, type Seed } from "@beechcms/core"
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
  /**
   * If false, indicates the table already has entries.
   * Transitioning plain fields to confidential/restricted is forbidden when table has data.
   */
  tableEmpty?: boolean
}

const CLASSIFICATIONS: DataClassification[] = ["public", "internal", "confidential", "restricted"]

/**
 * Form fragment for configuring CRUD, privacy, and search index policies on top-level branch fields.
 */
export function PoliciesOptionsForm({
  branch,
  onChange,
  subField,
  tableEmpty = true,
}: PoliciesOptionsFormProps) {
  const { t } = useTranslation()

  if (subField) return null

  const effective = resolvePolicies(branch)

  const isRepeater = branch.type === "repeater"
  const isRestricted = effective.classification === "restricted"
  const isConfidential = effective.classification === "confidential"
  const isInternal = effective.classification === "internal"

  // Initial classification of the branch (before any unsaved edits on this branch)
  const initialClassification = effective.classification
  const isInitiallyPlain = initialClassification === "public" || initialClassification === "internal"

  function isClassificationOptionDisabled(opt: DataClassification): boolean {
    if (tableEmpty) return false
    // When table is not empty, changing storage tier across plain <-> encrypt <-> hash is forbidden
    if (isInitiallyPlain) {
      return opt === "confidential" || opt === "restricted"
    }
    if (initialClassification === "confidential") {
      return opt !== "confidential"
    }
    if (initialClassification === "restricted") {
      return opt !== "restricted"
    }
    return false
  }

  function isPolicyDisabled(pol: "search" | "filter" | "sort" | "public"): boolean {
    if (isRestricted) return true
    if (pol === "search" || pol === "sort") return isRepeater || isConfidential
    if (pol === "filter") return isRepeater
    if (pol === "public") return isConfidential || isInternal
    return false
  }

  function handleClassificationChange(selected: DataClassification) {
    const currentPolicies = branch.policies ?? {}
    const nextPolicies: NonNullable<Branch["policies"]> = {
      ...currentPolicies,
      classification: selected,
    }

    if (selected === "restricted") {
      delete nextPolicies.search
      delete nextPolicies.filter
      delete nextPolicies.sort
      delete nextPolicies.public
      delete nextPolicies.publicEdit
      delete nextPolicies.visibility
    } else if (selected === "confidential") {
      delete nextPolicies.search
      delete nextPolicies.sort
      delete nextPolicies.public
      delete nextPolicies.publicEdit
    } else if (selected === "internal") {
      delete nextPolicies.public
      delete nextPolicies.publicEdit
    }

    onChange({
      ...branch,
      policies: nextPolicies,
    })
  }

  function setPolicy<K extends keyof NonNullable<Branch["policies"]>>(
    key: K,
    value: NonNullable<Branch["policies"]>[K]
  ) {
    onChange({
      ...branch,
      policies: {
        ...branch.policies,
        classification: effective.classification,
        [key]: value,
      },
    })
  }

  return (
    <div className="space-y-3 rounded-md border p-2.5">
      <p className="text-xs font-medium">{t("seedBuilder.branchEditor.policies")}</p>

      {/* Primary Selector: Data Classification */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t("seedBuilder.policies.classification")}</Label>
          {effective.privacy === "encrypt" && (
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
              {t("seedBuilder.policies.storage_encrypted")}
            </span>
          )}
        </div>
        <Select
          value={effective.classification}
          onValueChange={(v) => handleClassificationChange(v as DataClassification)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLASSIFICATIONS.map((c) => (
              <SelectItem
                key={c}
                value={c}
                disabled={isClassificationOptionDisabled(c)}
                className="text-xs"
              >
                {t(`seedBuilder.policies.classification_${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {t(`seedBuilder.policies.classification_${effective.classification}_desc`)}
        </p>
        {!tableEmpty && isInitiallyPlain && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {t("seedBuilder.policies.classification_locked_entries")}
          </p>
        )}
        {!tableEmpty && initialClassification === "confidential" && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {t("seedBuilder.policies.classification_locked_encrypted")}
          </p>
        )}
        {!tableEmpty && initialClassification === "restricted" && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {t("seedBuilder.policies.classification_locked_restricted")}
          </p>
        )}
      </div>

      {/* Advanced Flags */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t">
        {(["search", "filter", "sort", "public"] as const).map((pol) => {
          const disabled = isPolicyDisabled(pol)
          return (
            <div key={pol} className="flex items-center gap-2">
              <Checkbox
                id={`policy-${branch.id}-${pol}`}
                checked={effective[pol]}
                disabled={disabled}
                onCheckedChange={(v) => setPolicy(pol, !!v)}
              />
              <Label
                htmlFor={`policy-${branch.id}-${pol}`}
                className={`text-xs ${disabled ? "text-muted-foreground cursor-not-allowed opacity-70" : ""}`}
              >
                {t(`seedBuilder.policies.${pol}`)}
              </Label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
