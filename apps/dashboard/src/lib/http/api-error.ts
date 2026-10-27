// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** One rejected field in a 400/422 body. */
export interface ApiErrorField {
  field?: string
  message?: string
  expected?: string
  received?: string
}

/**
 * The failure bodies the API emits: RFC 7807/9457 problem details (`type`, `title`, `detail`),
 * the OAuth `error`/`error_description` pair, and the legacy `{ error }` form. Every member is
 * optional because the body is server-controlled and a given endpoint emits only one of them.
 */
export interface ApiErrorBody {
  type?: string
  title?: string
  detail?: string
  status?: number
  error?: string
  error_description?: string
  message?: string
  errors?: ApiErrorField[]
}

/**
 * Thrown by the API client for every non-2xx response. Network failures and aborted/timed-out
 * requests are NOT wrapped: they have no response, so they surface as the native error.
 */
export class ApiError extends Error {
  readonly status: number
  /** Parsed JSON body, or null when the body was empty or not a JSON object. */
  readonly data: ApiErrorBody | null

  constructor(status: number, data: ApiErrorBody | null, message?: string) {
    super(message ?? `Request failed with status code ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** Last segment of a problem `type` URI (`…/problems/invitation-invalid` → `invitation-invalid`). */
export function problemCode(error: unknown): string | null {
  if (!isApiError(error)) return null
  const type = error.data?.type
  return typeof type === 'string' ? (type.split('/').pop() ?? null) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Builds the ApiError for a failed response. The body is read as text and parsed leniently so a
 * `blob` download that fails still yields the problem document instead of an opaque Blob.
 */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let data: ApiErrorBody | null = null
  try {
    const text = await response.text()
    const parsed: unknown = text === '' ? null : JSON.parse(text)
    data = isRecord(parsed) ? (parsed as ApiErrorBody) : null
  } catch {
    data = null
  }
  return new ApiError(response.status, data)
}
