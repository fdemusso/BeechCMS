// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Three-step import wizard: pick a file/format, upload it, track the resulting job.
 * No e2e suite covers this flow — the end-to-end path (presign -> PUT -> import -> completed)
 * is exercised against real D1 by
 * apps/api/src/features/content/test/integration/content-import.integration.test.ts.
 */

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { isFlatSeed, nonFlatBranches } from "@beechcms/core"
import type { Seed, TransferFormat } from "@beechcms/core"
import { Upload as ImportIcon } from "reicon-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { usePermissions } from "@/features/shared/hooks/use-permissions"

import { ImportJobPanel } from "./import-job-panel"
import {
  createImportJob,
  isStorageNotConfiguredError,
  presignImportObject,
  readProblem,
  type ImportJobResponse,
} from "../api/transfer.api"

export interface ImportWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: Seed
  /** Fired when a job reaches `completed`, so the caller can invalidate its own query keys.
   *  The wizard does not know the content-management key namespace and must not import it. */
  onImportCompleted?: () => void
}

type WizardStep = "pick" | "uploading" | "tracking"

export function ImportWizardDialog({ open, onOpenChange, seed, onImportCompleted }: ImportWizardDialogProps) {
  const { t } = useTranslation()
  const { canGlobally } = usePermissions()

  const seedIsFlat = isFlatSeed(seed)
  const offendingAliases = React.useMemo(() => nonFlatBranches(seed).map((branch) => branch.alias), [seed])

  const [step, setStep] = React.useState<WizardStep>("pick")
  const [file, setFile] = React.useState<File | null>(null)
  const [format, setFormat] = React.useState<TransferFormat>(seedIsFlat ? "csv" : "ndjson")
  const [jobId, setJobId] = React.useState<string | null>(null)

  const canUpload = canGlobally("content:create")

  const resetWizard = React.useCallback(() => {
    setStep("pick")
    setFile(null)
    setJobId(null)
  }, [])

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && step === "uploading") return // not closable during upload — see §4.5
      if (!next) resetWizard()
      onOpenChange(next)
    },
    [step, resetWizard, onOpenChange],
  )

  const handleStartUpload = React.useCallback(async () => {
    if (!file) return
    setStep("uploading")
    try {
      const objectKey = await presignImportObject(file, format)
      const newJobId = await createImportJob(seed.slug, objectKey, format)
      setJobId(newJobId)
      setStep("tracking")
    } catch (error) {
      if (isStorageNotConfiguredError(error)) {
        toast.error(t("transfer.import.errors.storageNotConfigured"))
        setStep("pick")
        return
      }
      const problem = await readProblem(error)
      toast.error(problem?.detail ?? t("transfer.import.errors.unknown"))
      setStep("pick")
    }
  }, [file, format, seed.slug, t])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={step !== "uploading"}>
        <DialogHeader>
          <DialogTitle>{t("transfer.import.title", { label: seed.label })}</DialogTitle>
          <DialogDescription>{t("transfer.import.description")}</DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("transfer.import.formatLabel")}</Label>
              <div role="radiogroup" className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="import-format"
                    id="import-format-csv"
                    value="csv"
                    checked={format === "csv"}
                    disabled={!seedIsFlat}
                    onChange={() => setFormat("csv")}
                  />
                  <Label htmlFor="import-format-csv" className={!seedIsFlat ? "text-muted-foreground" : undefined}>
                    CSV
                  </Label>
                </div>
                {!seedIsFlat && (
                  <p className="pl-6 text-xs text-muted-foreground">
                    {t("transfer.import.csvDisabled", { branches: offendingAliases.join(", ") })}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="import-format"
                    id="import-format-ndjson"
                    value="ndjson"
                    checked={format === "ndjson"}
                    onChange={() => setFormat("ndjson")}
                  />
                  <Label htmlFor="import-format-ndjson">NDJSON</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-file-input">{t("transfer.import.fileLabel")}</Label>
              <input
                id="import-file-input"
                type="file"
                accept=".csv,.ndjson,.json,.txt"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
            </div>

            {!canUpload && (
              <p className="text-xs text-destructive">{t("transfer.import.presignPermissionWarning")}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleStartUpload} disabled={!file || !canUpload}>
                {t("transfer.import.startUpload")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "uploading" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">{t("transfer.import.uploading")}</p>
          </div>
        )}

        {step === "tracking" && jobId && (
          <div className="space-y-4 py-2">
            <ImportJobPanel
              jobId={jobId}
              onCompleted={(job: ImportJobResponse) => {
                if (job.state === "completed") onImportCompleted?.()
              }}
            />
            <a
              href={`/content/import-jobs/${jobId}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline"
            >
              {t("transfer.import.openJobPage")}
            </a>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
