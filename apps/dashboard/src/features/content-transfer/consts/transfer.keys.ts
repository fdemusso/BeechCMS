// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export const TRANSFER_QUERY_KEYS = {
  all: ["import-jobs"] as const,
  detail: (jobId: string) => [...TRANSFER_QUERY_KEYS.all, jobId] as const,
}

/** Two seconds: a chunk of DEFAULT_IMPORT_CHUNK_ROWS rows completes well inside this, so the
 *  counters advance visibly without hammering an endpoint that reads a D1 row per call. */
export const IMPORT_JOB_POLL_MS = 2_000
