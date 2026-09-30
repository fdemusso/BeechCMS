// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Mirror of the API's frozen content problem types (apps/api/src/features/content/handlers/helpers.ts). */
export const CONTENT_ERROR_CODES = {
  SLUG_CONFLICT: "content-slug-conflict",
  UPDATE_CONFLICT: "content-update-conflict",
} as const

export type ContentErrorCode = (typeof CONTENT_ERROR_CODES)[keyof typeof CONTENT_ERROR_CODES]

/**
 * Extracts the slice error code from an RFC 9457 body.
 * The API emits `type: "https://beechcms.dev/problems/<code>"`
 * (`apps/api/src/public/errors/problem-details.ts#normalizeProblemType`).
 */
export function contentErrorCode(error: unknown): ContentErrorCode | null {
  const type = (error as { response?: { data?: { type?: unknown } } })?.response?.data?.type
  if (typeof type !== "string") return null
  const code = type.split("/").pop() ?? ""
  return (Object.values(CONTENT_ERROR_CODES) as string[]).includes(code)
    ? (code as ContentErrorCode)
    : null
}
