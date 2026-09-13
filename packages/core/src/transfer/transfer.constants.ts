// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Hard cap on rows a single synchronous export may stream (brief §2). Past this the
 * endpoint answers 413 rather than opening a stream that the edge may truncate mid-file.
 * Overridable per deployment by the API layer (S2) — this is the default, not the law.
 */
export const DEFAULT_EXPORT_MAX_ROWS = 50_000

/** Page size for the export producer's findMany loop. Never materialise the full set. */
export const DEFAULT_EXPORT_PAGE_SIZE = 500

/**
 * Rows an import consumer processes per queue invocation before persisting its offset
 * and re-enqueuing (brief §2). Sized well under the Workers CPU budget so a chunk that
 * retries repeats at most this many already-inserted rows.
 */
export const DEFAULT_IMPORT_CHUNK_ROWS = 500

/**
 * Upper bound on per-row errors retained in a job report (brief §4). Beyond this only
 * the aggregate failure count grows, so one pathological file cannot unbound the row.
 */
export const MAX_JOB_ERROR_SAMPLES = 100
