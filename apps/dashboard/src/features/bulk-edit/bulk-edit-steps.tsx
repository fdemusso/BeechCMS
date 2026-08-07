// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import type { Branch } from "@beechcms/core"

import { DialogFooter } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { FieldEdit } from "@/components/fields"
import type { BulkMultiRelMode } from "@/features/content-management"

/**
 * Generates and triggers a browser download for a CSV report containing the bulk-edit failure details.
 *
 * @param failed - Array of failed update items.
 * @param slug - The schema slug of the seed being edited.
 */
function downloadCsv(
  failed: Array<{ id: string; problem: { status: number; type: string; detail: string } }>,
  slug: string
) {
  const rows = [
    ["id", "type", "detail"],
    ...failed.map((failure) => [failure.id, failure.problem.type, failure.problem.detail]),
  ]
  const csvContent = rows
    .map((row) => row.map((cellValue) => `"${String(cellValue).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csvContent], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const downloadAnchor = document.createElement("a")
  downloadAnchor.href = url
  downloadAnchor.download = `bulk-edit-failures-${slug}.csv`
  downloadAnchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Properties for the {@link BulkEditPickStep} component.
 */
export interface BulkEditPickStepProps {
  /** The currently chosen field alias. */
  selectedAlias: string
  /** Callback triggered when field selection changes. */
  onSelectedAliasChange: (alias: string) => void
  /** List of branches available for bulk editing. */
  editableBranches: Branch[]
  /** Callback to close the bulk edit dialog. */
  onCancel: () => void
  /** Callback to move to the edit/value input step. */
  onNext: () => void
}

/**
 * Wizard Step 1: Allows selecting which field to update from the available bulk-editable branches.
 */
export function BulkEditPickStep({
  selectedAlias,
  onSelectedAliasChange,
  editableBranches,
  onCancel,
  onNext,
}: BulkEditPickStepProps) {
  const { t: translate } = useTranslation()

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">{translate("bulkEdit.pickField")}</p>
      <Select value={selectedAlias} onValueChange={onSelectedAliasChange}>
        <SelectTrigger>
          <SelectValue placeholder={translate("bulkEdit.pickField")} />
        </SelectTrigger>
        <SelectContent>
          {editableBranches.map((branch) => (
            <SelectItem key={branch.alias} value={branch.alias}>
              {branch.label ?? branch.alias}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {translate("common.cancel")}
        </Button>
        <Button onClick={onNext} disabled={!selectedAlias}>
          {translate("common.confirm")}
        </Button>
      </DialogFooter>
    </div>
  )
}

/**
 * Properties for the {@link BulkEditValueStep} component.
 */
export interface BulkEditValueStepProps {
  /** The selected branch descriptor. */
  selectedBranch: Branch
  /** True if the selected branch is a multi-value relation. */
  isMulti: boolean
  /** Mode to apply to multi-value relation fields (replace, add, remove). */
  multiMode: BulkMultiRelMode
  /** Callback triggered when multi-value mode changes. */
  onMultiModeChange: (mode: BulkMultiRelMode) => void
  /** The configured value for bulk edit. */
  fieldValue: unknown
  /** Callback triggered when the field value changes. */
  onFieldValueChange: (value: unknown) => void
  /** Callback to return to the field selection step. */
  onBack: () => void
  /** Callback to move to the confirmation step. */
  onNext: () => void
}

/**
 * Wizard Step 2: Renders the input control corresponding to the selected field type.
 */
export function BulkEditValueStep({
  selectedBranch,
  isMulti,
  multiMode,
  onMultiModeChange,
  fieldValue,
  onFieldValueChange,
  onBack,
  onNext,
}: BulkEditValueStepProps) {
  const { t: translate } = useTranslation()

  return (
    <div className="space-y-4 py-2">
      {isMulti && (
        <div className="flex gap-2">
          {(["replace", "add", "remove"] as BulkMultiRelMode[]).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={multiMode === mode ? "default" : "outline"}
              onClick={() => onMultiModeChange(mode)}
            >
              {translate(`bulkEdit.mode.${mode}`)}
            </Button>
          ))}
        </div>
      )}
      <FieldEdit branch={selectedBranch} value={fieldValue} onChange={onFieldValueChange} />
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          {translate("common.back")}
        </Button>
        <Button onClick={onNext}>{translate("common.confirm")}</Button>
      </DialogFooter>
    </div>
  )
}

/**
 * Properties for the {@link BulkEditConfirmStep} component.
 */
export interface BulkEditConfirmStepProps {
  /** List of entry IDs selected for update. */
  selectedIds: string[]
  /** Sample titles or identifiers for preview. */
  sampleList: string[]
  /** Callback to return to the value editor step. */
  onBack: () => void
  /** Callback to trigger execution of the bulk updates. */
  onConfirm: () => void
  /** True when the update request is in-flight. */
  isPending: boolean
}

/**
 * Wizard Step 3: Displays a preview of selected entries and prompts for final confirmation.
 */
export function BulkEditConfirmStep({
  selectedIds,
  sampleList,
  onBack,
  onConfirm,
  isPending,
}: BulkEditConfirmStepProps) {
  const { t: translate } = useTranslation()

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm">{translate("bulkEdit.confirm", { count: selectedIds.length })}</p>
      <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
        {sampleList.map((label) => (
          <li key={label} className="truncate">
            {label}
          </li>
        ))}
        {selectedIds.length > 5 && <li className="text-xs">…and {selectedIds.length - 5} more</li>}
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          {translate("common.back")}
        </Button>
        <Button onClick={onConfirm} disabled={isPending}>
          {translate("common.confirm")}
        </Button>
      </DialogFooter>
    </div>
  )
}

/**
 * Wizard Step 4: Displays progress loading state while bulk update request is running.
 */
export function BulkEditExecutingStep() {
  const { t: translate } = useTranslation()

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">{translate("bulkEdit.executing")}</p>
      <Progress value={undefined} className="animate-pulse" />
    </div>
  )
}

/**
 * Properties for the {@link BulkEditResultStep} component.
 */
export interface BulkEditResultStepProps {
  /** The bulk-update execution result object. */
  result: {
    updated: number
    failed: Array<{ id: string; problem: { status: number; type: string; detail: string } }>
  }
  /** List of entry IDs selected for update. */
  selectedIds: string[]
  /** Slug of the schema seed being updated. */
  seedSlug: string
  /** Callback to close the dialog. */
  onClose: () => void
}

/**
 * Wizard Step 5: Shows execution results including success counts and lists any failures with report download.
 */
export function BulkEditResultStep({
  result,
  selectedIds,
  seedSlug,
  onClose,
}: BulkEditResultStepProps) {
  const { t: translate } = useTranslation()

  return (
    <div className="space-y-4 py-2">
      {result.failed.length === 0 ? (
        <p className="text-sm text-green-600 dark:text-green-400">
          {translate("bulkEdit.successAll", { count: result.updated })}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            {translate("bulkEdit.successPartial", {
              updated: result.updated,
              total: selectedIds.length,
              failed: result.failed.length,
            })}
          </p>
          <div className="rounded-md border p-3 space-y-1 max-h-40 overflow-y-auto">
            {result.failed.map((failure) => (
              <p key={failure.id} className="text-xs text-destructive font-mono truncate">
                {failure.id}: {failure.problem.detail}
              </p>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => downloadCsv(result.failed, seedSlug)}>
            {translate("bulkEdit.downloadReport")}
          </Button>
        </div>
      )}
      <DialogFooter>
        <Button onClick={onClose}>{translate("common.close")}</Button>
      </DialogFooter>
    </div>
  )
}
