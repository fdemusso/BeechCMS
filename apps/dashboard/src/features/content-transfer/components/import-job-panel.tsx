// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Loader, AlertTriangle } from "reicon-react"

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

import { useImportJob } from "../hooks/use-import-job"
import { readProblem, type ImportJobResponse, type ImportJobState } from "../api/transfer.api"

export interface ImportJobPanelProps {
  jobId: string
  /** Fired once, on the first render in which the job reaches `completed`. */
  onCompleted?: (job: ImportJobResponse) => void
}

const STATE_BADGE_VARIANT: Record<ImportJobState, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  processing: "secondary",
  completed: "default",
  failed: "destructive",
}

export function ImportJobPanel({ jobId, onCompleted }: ImportJobPanelProps) {
  const { t } = useTranslation()
  const query = useImportJob(jobId)
  const job = query.data

  const [problemDetail, setProblemDetail] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!query.error) {
      setProblemDetail(null)
      return
    }
    let cancelled = false
    readProblem(query.error).then((problem) => {
      if (cancelled) return
      if (problem?.status === 403) setProblemDetail(t("transfer.job.errors.forbidden"))
      else if (problem?.status === 404) setProblemDetail(t("transfer.job.errors.notFound"))
      else setProblemDetail(problem?.detail ?? t("transfer.job.errors.unknown"))
    })
    return () => {
      cancelled = true
    }
  }, [query.error, t])

  const completedFiredRef = React.useRef(false)
  React.useEffect(() => {
    if (job?.state === "completed" && !completedFiredRef.current) {
      completedFiredRef.current = true
      onCompleted?.(job)
    }
  }, [job, onCompleted])

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader className="size-4 animate-spin" />
        {t("transfer.job.loading")}
      </div>
    )
  }

  if (query.error || !job) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="size-4" />
        {problemDetail ?? t("transfer.job.errors.unknown")}
      </div>
    )
  }

  const unlistedFailures = job.failedRows - job.errors.length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant={STATE_BADGE_VARIANT[job.state]}>
          {job.state === "processing" && <Loader className="size-3 animate-spin" />}
          {t(`transfer.job.state.${job.state}`)}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {job.targetSeed} · {job.format.toUpperCase()}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("transfer.job.rowsRead")}</dt>
          <dd className="font-medium tabular-nums">{job.rowsRead}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("transfer.job.insertedRows")}</dt>
          <dd className="font-medium tabular-nums">{job.insertedRows}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("transfer.job.failedRows")}</dt>
          <dd className="font-medium tabular-nums">{job.failedRows}</dd>
        </div>
      </dl>

      {job.state === "processing" && (
        // Indeterminate: the job record carries an offset, never a total (no denominator to show).
        <Progress value={undefined} className="animate-pulse" />
      )}

      {job.errors.length > 0 && (
        <div className="rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-2 py-1.5">{t("transfer.job.errorTable.row")}</th>
                <th className="px-2 py-1.5">{t("transfer.job.errorTable.field")}</th>
                <th className="px-2 py-1.5">{t("transfer.job.errorTable.code")}</th>
                <th className="px-2 py-1.5">{t("transfer.job.errorTable.message")}</th>
              </tr>
            </thead>
            <tbody>
              {job.errors.map((rowError) => (
                <tr key={`${rowError.row}-${rowError.code}`} className="border-b last:border-0">
                  <td className="px-2 py-1.5 tabular-nums">{rowError.row}</td>
                  <td className="px-2 py-1.5">{rowError.field ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono">{rowError.code}</td>
                  <td className="px-2 py-1.5">{rowError.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unlistedFailures > 0 && (
        // Regression guard: failedRows can exceed errors.length once the server's
        // MAX_JOB_ERROR_SAMPLES cap is hit — never present that truncated list as complete.
        <p className="text-xs text-muted-foreground">
          {t("transfer.job.errorTable.capped", { count: unlistedFailures })}
        </p>
      )}
    </div>
  )
}
