// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { resolvePolicies } from "@beechcms/core"
import type { Seed, Branch } from "@beechcms/core"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
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
import { useBulkUpdate } from "@/features/content-management"
import type { BulkMultiRelMode, BulkFieldValue } from "@/features/content-management"

/** Step identifiers representing the states of the bulk edit wizard. */
type Step = "pick" | "edit" | "confirm" | "executing" | "result"

/** Properties for the {@link BulkEditDialog} component. */
interface BulkEditDialogProps {
  /** Controls open/close visibility of the dialog. */
  open: boolean
  /** Callback fired when the open state changes. */
  onOpenChange: (open: boolean) => void
  /** The schema seed definition. */
  seed: Seed
  /** List of entry IDs selected for bulk editing. */
  selectedIds: string[]
  /** Optional display names for selected entries to show in the confirmation step. */
  sampleLabels?: string[]
}

/**
 * Checks if a given schema branch is a multi-value relation field.
 *
 * @param branch - The schema branch definition to inspect.
 * @returns True if the branch is a relation type and configured with `multiple: true`.
 */
function isMultiRelBranch(branch: Branch): boolean {
  return branch.type === "relation" && (branch as { multiple?: boolean }).multiple === true
}

/**
 * Checks if a schema branch can be bulk edited based on its visibility and privacy policies.
 *
 * @param branch - The schema branch definition to inspect.
 * @returns True if the branch is visible and not encrypted.
 */
function isBulkEditable(branch: Branch): boolean {
  const { visibility, privacy } = resolvePolicies(branch)
  if (visibility === "hidden") return false
  if (privacy === "encrypt") return false
  return true
}

/**
 * Generates and triggers a browser download for a CSV report containing the bulk-edit failure details.
 *
 * @param failed - Array of failed update items.
 * @param slug - The schema slug of the seed being edited.
 */
function downloadCsv(
  failed: Array<{ id: string; problem: { type: string; detail: string } }>,
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
 * BulkEditDialog component.
 * Provides a wizard to select a field, configure the new value (or relation changes),
 * confirm the selected entry IDs, and execute bulk update operations with progress monitoring.
 *
 * @param props - Component properties conforming to {@link BulkEditDialogProps}.
 */
export function BulkEditDialog({
  open,
  onOpenChange,
  seed,
  selectedIds,
  sampleLabels,
}: BulkEditDialogProps) {
  const { t: translate } = useTranslation()
  const [step, setStep] = React.useState<Step>("pick")
  const [selectedAlias, setSelectedAlias] = React.useState<string>("")
  const [multiMode, setMultiMode] = React.useState<BulkMultiRelMode>("replace")
  const [fieldValue, setFieldValue] = React.useState<unknown>(null)
  const [result, setResult] = React.useState<{
    updated: number
    failed: Array<{ id: string; problem: { status: number; type: string; detail: string } }>
  } | null>(null)

  const { mutateAsync: bulkUpdate, isPending } = useBulkUpdate(seed.slug)

  // Reset states on open/close
  React.useEffect(() => {
    if (!open) {
      setStep("pick")
      setSelectedAlias("")
      setFieldValue(null)
      setResult(null)
      setMultiMode("replace")
    }
  }, [open])

  const editableBranches = React.useMemo(
    () => seed.branches.filter(isBulkEditable),
    [seed.branches]
  )

  const selectedBranch = React.useMemo(
    () => seed.branches.find((branch) => branch.alias === selectedAlias) ?? null,
    [seed.branches, selectedAlias]
  )

  const isMulti = selectedBranch ? isMultiRelBranch(selectedBranch) : false

  const handlePickNext = () => {
    if (!selectedAlias) return
    setFieldValue(isMulti ? [] : null)
    setStep("edit")
  }

  const handleEditNext = () => setStep("confirm")

  const handleConfirm = async () => {
    if (!selectedBranch) return
    setStep("executing")

    let fieldPayload: BulkFieldValue
    if (isMulti) {
      fieldPayload = { mode: multiMode, value: (fieldValue as string[]) ?? [] }
    } else {
      fieldPayload = fieldValue
    }

    try {
      const response = await bulkUpdate({
        ids: selectedIds,
        fields: { [selectedAlias]: fieldPayload },
      })
      setResult(response)
    } catch {
      setResult({
        updated: 0,
        failed: selectedIds.map((id) => ({
          id,
          problem: { status: 500, type: "error", detail: "Request failed" },
        })),
      })
    }
    setStep("result")
  }

  const sampleList = sampleLabels?.slice(0, 5) ?? selectedIds.slice(0, 5)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate("bulkEdit.title", { count: selectedIds.length })}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1 — Field picker */}
        {step === "pick" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{translate("bulkEdit.pickField")}</p>
            <Select value={selectedAlias} onValueChange={setSelectedAlias}>
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {translate("common.cancel")}
              </Button>
              <Button onClick={handlePickNext} disabled={!selectedAlias}>
                {translate("common.confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2 — Value editor */}
        {step === "edit" && selectedBranch && (
          <div className="space-y-4 py-2">
            {isMulti && (
              <div className="flex gap-2">
                {(["replace", "add", "remove"] as BulkMultiRelMode[]).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={multiMode === mode ? "default" : "outline"}
                    onClick={() => setMultiMode(mode)}
                  >
                    {translate(`bulkEdit.mode.${mode}`)}
                  </Button>
                ))}
              </div>
            )}
            <FieldEdit
              branch={selectedBranch}
              value={fieldValue}
              onChange={setFieldValue}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("pick")}>
                {translate("common.back")}
              </Button>
              <Button onClick={handleEditNext}>{translate("common.confirm")}</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3 — Confirmation */}
        {step === "confirm" && (
          <div className="space-y-4 py-2">
            <p className="text-sm">
              {translate("bulkEdit.confirm", { count: selectedIds.length })}
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
              {sampleList.map((label) => (
                <li key={label} className="truncate">{label}</li>
              ))}
              {selectedIds.length > 5 && (
                <li className="text-xs">…and {selectedIds.length - 5} more</li>
              )}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("edit")}>
                {translate("common.back")}
              </Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                {translate("common.confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4 — Executing */}
        {step === "executing" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">{translate("bulkEdit.executing")}</p>
            <Progress value={undefined} className="animate-pulse" />
          </div>
        )}

        {/* Step 5 — Result */}
        {step === "result" && result && (
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadCsv(result.failed, seed.slug)}
                >
                  {translate("bulkEdit.downloadReport")}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{translate("common.close")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
