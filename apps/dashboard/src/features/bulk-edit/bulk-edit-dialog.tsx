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
} from "@/components/ui/dialog"
import { useBulkUpdate } from "@/features/content-management"
import type { BulkMultiRelMode, BulkFieldValue } from "@/features/content-management"

import {
  BulkEditPickStep,
  BulkEditValueStep,
  BulkEditConfirmStep,
  BulkEditExecutingStep,
  BulkEditResultStep,
} from "./bulk-edit-steps"

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
  if (privacy !== "plain") return false
  return true
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
          <BulkEditPickStep
            selectedAlias={selectedAlias}
            onSelectedAliasChange={setSelectedAlias}
            editableBranches={editableBranches}
            onCancel={() => onOpenChange(false)}
            onNext={handlePickNext}
          />
        )}

        {/* Step 2 — Value editor */}
        {step === "edit" && selectedBranch && (
          <BulkEditValueStep
            selectedBranch={selectedBranch}
            isMulti={isMulti}
            multiMode={multiMode}
            onMultiModeChange={setMultiMode}
            fieldValue={fieldValue}
            onFieldValueChange={setFieldValue}
            onBack={() => setStep("pick")}
            onNext={handleEditNext}
          />
        )}

        {/* Step 3 — Confirmation */}
        {step === "confirm" && (
          <BulkEditConfirmStep
            selectedIds={selectedIds}
            sampleList={sampleList}
            onBack={() => setStep("edit")}
            onConfirm={handleConfirm}
            isPending={isPending}
          />
        )}

        {/* Step 4 — Executing */}
        {step === "executing" && <BulkEditExecutingStep />}

        {/* Step 5 — Result */}
        {step === "result" && result && (
          <BulkEditResultStep
            result={result}
            selectedIds={selectedIds}
            seedSlug={seed.slug}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
