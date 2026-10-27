// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TransferFormat } from "@beechcms/core"

import { api } from "@/lib/api"
import { rpc } from "@/lib/rpc"
import { isApiError } from "@/lib/http/api-error"

export type ImportJobState = "pending" | "processing" | "completed" | "failed"

/** One rejected row. `row` is the 1-based index of the DATA record, header excluded. */
export interface ImportRowError {
  row: number
  code: string
  message: string
  field?: string
}

/** The wire shape of GET /api/content/import-jobs/:id. `objectKey` and `createdBy` are
 *  deliberately absent from the endpoint — do not add them here to "complete" the type. */
export interface ImportJobResponse {
  id: string
  targetSeed: string
  format: TransferFormat
  state: ImportJobState
  rowsRead: number
  insertedRows: number
  failedRows: number
  errors: ImportRowError[]
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

/** RFC 7807, as `publicProblem()` emits it. `type` is the contract; `detail` is copy. */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  errors?: Array<{ field?: string; expected?: string; received?: string; message?: string }>
}

/** The non-RFC-7807 body `R2Bucket.presignPut()` throws when S3 credentials are absent. */
interface StorageNotConfiguredProblem {
  error: "presigned_urls_require_s3_credentials"
  message: string
}

const TERMINAL_STATES: ReadonlySet<ImportJobState> = new Set<ImportJobState>(["completed", "failed"])

export function isTerminalState(state: ImportJobState | undefined): boolean {
  return state !== undefined && TERMINAL_STATES.has(state)
}

const FILE_EXTENSIONS: Record<TransferFormat, string> = { csv: "csv", ndjson: "ndjson" }

/**
 * The MIME type sent to POST /upload/presign, derived from the chosen FORMAT and never from
 * `file.type` — a browser reports "" for a .ndjson file, and `application/x-ndjson` is absent
 * from the upload allowlist (packages/core/src/media/file-types.ts), so presigning under its
 * canonical type is refused. The stored content type is not authoritative: the import handler
 * takes `format` from the request body and never reads head.contentType.
 */
const PRESIGN_MIME_TYPES: Record<TransferFormat, string> = {
  csv: "text/csv",
  ndjson: "application/json",
}

const CONTENT_TYPES: Record<TransferFormat, string> = {
  csv: "text/csv",
  ndjson: "application/x-ndjson",
}

/**
 * Reads the RFC 7807 body out of an `ApiError`. The client parses error bodies as JSON whatever
 * the `responseType`, so a failed `blob` download needs no special handling here.
 */
export function readProblem(error: unknown): ProblemDetails | null {
  if (!isApiError(error) || error.data === null) return null
  return "type" in error.data ? (error.data as unknown as ProblemDetails) : null
}

/**
 * 501 from `POST /upload/presign` on a native-`R2Bucket` deployment (no S3 credentials) does not
 * emit an RFC 7807 body — it throws `{error: "presigned_urls_require_s3_credentials", message}` —
 * so `readProblem` returns null for it. Checked separately rather than folded into `readProblem`
 * so callers that only care about the RFC 7807 contract are not forced to widen their type.
 */
export function isStorageNotConfiguredError(error: unknown): boolean {
  if (!isApiError(error) || error.status !== 501) return false
  return (error.data as StorageNotConfiguredProblem | null)?.error === "presigned_urls_require_s3_credentials"
}

/**
 * Streams the export into a Blob and hands it to the browser as a download.
 * `timeout: 0` overrides the client's 30 s default: an export up to EXPORT_MAX_ROWS rows can
 * legitimately stream for longer, and aborting mid-stream is the corrupted-file failure the
 * server's 413 cap exists to prevent.
 */
export async function downloadExport(slug: string, format: TransferFormat): Promise<void> {
  const response = await api.get<Blob>(`/content/${slug}/export`, {
    params: { format },
    responseType: "blob",
    timeout: 0,
  })

  // The filename the API sets in Content-Disposition; rebuilt rather than parsed, because the
  // header is not exposed to the browser on a cross-origin response and parsing it would be a
  // second, weaker source of truth.
  const filename = `${slug}.${FILE_EXTENSIONS[format]}`
  const blob = new Blob([response.data], { type: CONTENT_TYPES[format] })
  const url = URL.createObjectURL(blob)
  const downloadAnchor = document.createElement("a")
  downloadAnchor.href = url
  downloadAnchor.download = filename
  downloadAnchor.click()
  URL.revokeObjectURL(url)
}

/**
 * presign -> PUT. Returns the R2 object key that POST /content/:slug/import consumes.
 *
 * Deliberately NOT lib/upload.ts's uploadFile(): that helper also calls POST /upload/confirm,
 * which registers the object in the media library. An import file is transport — the chunk
 * worker deletes it on a terminal job state — so a permanent media row would outlive the object.
 */
export async function presignImportObject(file: File, format: TransferFormat): Promise<string> {
  const presignResponse = await rpc.api.upload.presign.$post({
    json: {
      filename: file.name,
      mimeType: PRESIGN_MIME_TYPES[format],
      sizeBytes: file.size,
      purpose: "import",
    },
  })
  const presign = await presignResponse.json()

  const putResponse = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": PRESIGN_MIME_TYPES[format] },
    body: file,
  })
  if (!putResponse.ok) throw new Error(`Storage PUT failed: ${putResponse.status}`)

  return presign.key
}

export async function createImportJob(
  slug: string,
  objectKey: string,
  format: TransferFormat,
): Promise<string> {
  const response = await api.post<{ jobId: string }>(`/content/${slug}/import`, { objectKey, format })
  return response.data.jobId
}

export async function fetchImportJob(jobId: string): Promise<ImportJobResponse> {
  const response = await api.get<ImportJobResponse>(`/content/import-jobs/${jobId}`)
  return response.data
}
