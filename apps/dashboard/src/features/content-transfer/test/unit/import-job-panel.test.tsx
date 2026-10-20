// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("../../hooks/use-import-job")

import { useImportJob } from "../../hooks/use-import-job"
import { ImportJobPanel } from "../../components/import-job-panel"
import type { ImportJobResponse } from "../../api/transfer.api"

function job(overrides: Partial<ImportJobResponse>): ImportJobResponse {
  return {
    id: "job-1",
    targetSeed: "posts",
    format: "ndjson",
    state: "processing",
    rowsRead: 0,
    insertedRows: 0,
    failedRows: 0,
    errors: [],
    createdAt: 1,
    updatedAt: 1,
    finishedAt: null,
    ...overrides,
  }
}

function mockQuery(data: ImportJobResponse | undefined, extra: Record<string, unknown> = {}) {
  vi.mocked(useImportJob).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    ...extra,
  } as ReturnType<typeof useImportJob>)
}

describe("ImportJobPanel", () => {
  beforeEach(() => vi.clearAllMocks())

  it("states how many failures are not listed when failedRows exceeds errors.length", () => {
    // Regression guard: presenting a MAX_JOB_ERROR_SAMPLES-capped list as complete would hide
    // that 150 of the 250 failures have no row in the table at all.
    const completedJob = job({
      state: "completed",
      failedRows: 250,
      errors: Array.from({ length: 100 }, (_, index) => ({
        row: index + 1,
        code: "validation_error",
        message: "bad row",
      })),
    })
    mockQuery(completedJob)

    render(<ImportJobPanel jobId="job-1" />)

    expect(screen.getByText(/150/)).toBeInTheDocument()
  })

  it("renders the indeterminate progress bar and no percentage while processing", () => {
    mockQuery(job({ state: "processing" }))

    render(<ImportJobPanel jobId="job-1" />)

    const progress = screen.getByRole("progressbar")
    expect(progress).not.toHaveAttribute("aria-valuenow")
  })

  it("fires onCompleted exactly once for a completed job across a re-render", () => {
    const completedJob = job({ state: "completed" })
    mockQuery(completedJob)
    const onCompleted = vi.fn()

    const { rerender } = render(<ImportJobPanel jobId="job-1" onCompleted={onCompleted} />)
    rerender(<ImportJobPanel jobId="job-1" onCompleted={onCompleted} />)

    expect(onCompleted).toHaveBeenCalledOnce()
  })
})
