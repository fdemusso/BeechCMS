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
import { FieldEdit } from "@/features/fields"
import { useBulkUpdate } from "@/features/content-management"
import type { BulkMultiRelMode, BulkFieldValue } from "@/features/content-management"

type Step = "pick" | "edit" | "confirm" | "executing" | "result"

interface BulkEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: Seed
  selectedIds: string[]
  /** Optional display names for the first few selected entries (for sanity-check step) */
  sampleLabels?: string[]
}

function isMultiRelBranch(branch: Branch): boolean {
  return branch.type === "relation" && (branch as { multiple?: boolean }).multiple === true
}

function isBulkEditable(branch: Branch): boolean {
  const { visibility, privacy } = resolvePolicies(branch)
  if (visibility === "hidden") return false
  if (privacy === "encrypt") return false
  return true
}

function downloadCsv(
  failed: Array<{ id: string; problem: { type: string; detail: string } }>,
  slug: string
) {
  const rows = [
    ["id", "type", "detail"],
    ...failed.map((f) => [f.id, f.problem.type, f.problem.detail]),
  ]
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `bulk-edit-failures-${slug}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function BulkEditDialog({
  open,
  onOpenChange,
  seed,
  selectedIds,
  sampleLabels,
}: BulkEditDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = React.useState<Step>("pick")
  const [selectedAlias, setSelectedAlias] = React.useState<string>("")
  const [multiMode, setMultiMode] = React.useState<BulkMultiRelMode>("replace")
  const [fieldValue, setFieldValue] = React.useState<unknown>(null)
  const [result, setResult] = React.useState<{
    updated: number
    failed: Array<{ id: string; problem: { status: number; type: string; detail: string } }>
  } | null>(null)

  const { mutateAsync: bulkUpdate, isPending } = useBulkUpdate(seed.slug)

  // Reset on open/close
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
    () => seed.branches.find((b) => b.alias === selectedAlias) ?? null,
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
      const res = await bulkUpdate({
        ids: selectedIds,
        fields: { [selectedAlias]: fieldPayload },
      })
      setResult(res)
    } catch {
      setResult({ updated: 0, failed: selectedIds.map((id) => ({ id, problem: { status: 500, type: "error", detail: "Request failed" } })) })
    }
    setStep("result")
  }

  const sampleList = sampleLabels?.slice(0, 5) ?? selectedIds.slice(0, 5)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("bulkEdit.title", { count: selectedIds.length })}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1 — Field picker */}
        {step === "pick" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t("bulkEdit.pickField")}</p>
            <Select value={selectedAlias} onValueChange={setSelectedAlias}>
              <SelectTrigger>
                <SelectValue placeholder={t("bulkEdit.pickField")} />
              </SelectTrigger>
              <SelectContent>
                {editableBranches.map((b) => (
                  <SelectItem key={b.alias} value={b.alias}>
                    {b.label ?? b.alias}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handlePickNext} disabled={!selectedAlias}>
                {t("common.confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2 — Value editor */}
        {step === "edit" && selectedBranch && (
          <div className="space-y-4 py-2">
            {isMulti && (
              <div className="flex gap-2">
                {(["replace", "add", "remove"] as BulkMultiRelMode[]).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={multiMode === m ? "default" : "outline"}
                    onClick={() => setMultiMode(m)}
                  >
                    {t(`bulkEdit.mode.${m}`)}
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
                {t("common.back")}
              </Button>
              <Button onClick={handleEditNext}>{t("common.confirm")}</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3 — Confirmation */}
        {step === "confirm" && (
          <div className="space-y-4 py-2">
            <p className="text-sm">
              {t("bulkEdit.confirm", { count: selectedIds.length })}
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
                {t("common.back")}
              </Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                {t("common.confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4 — Executing */}
        {step === "executing" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">{t("bulkEdit.executing")}</p>
            <Progress value={undefined} className="animate-pulse" />
          </div>
        )}

        {/* Step 5 — Result */}
        {step === "result" && result && (
          <div className="space-y-4 py-2">
            {result.failed.length === 0 ? (
              <p className="text-sm text-green-600 dark:text-green-400">
                {t("bulkEdit.successAll", { count: result.updated })}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">
                  {t("bulkEdit.successPartial", {
                    updated: result.updated,
                    total: selectedIds.length,
                    failed: result.failed.length,
                  })}
                </p>
                <div className="rounded-md border p-3 space-y-1 max-h-40 overflow-y-auto">
                  {result.failed.map((f) => (
                    <p key={f.id} className="text-xs text-destructive font-mono truncate">
                      {f.id}: {f.problem.detail}
                    </p>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadCsv(result.failed, seed.slug)}
                >
                  {t("bulkEdit.downloadReport")}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
