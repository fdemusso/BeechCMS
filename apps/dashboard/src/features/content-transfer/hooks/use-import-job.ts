// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { fetchImportJob, isTerminalState, type ImportJobResponse } from "../api/transfer.api"
import { IMPORT_JOB_POLL_MS, TRANSFER_QUERY_KEYS } from "../consts/transfer.keys"

/**
 * Polls a job until it reaches a terminal state, then stops by itself.
 *
 * There is no cancel endpoint and no push channel: S3 shipped exactly two import routes, so the
 * job's own `state` field is the only signal that the work is over. Returning `false` from
 * refetchInterval is what ends the polling — an unmount-only stop would keep a completed job
 * refetching for as long as the dialog stays open.
 */
export function useImportJob(jobId: string | null): UseQueryResult<ImportJobResponse> {
  return useQuery({
    queryKey: TRANSFER_QUERY_KEYS.detail(jobId ?? ""),
    queryFn: () => fetchImportJob(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (query) => (isTerminalState(query.state.data?.state) ? false : IMPORT_JOB_POLL_MS),
    refetchOnWindowFocus: false,
    retry: false,
  })
}
