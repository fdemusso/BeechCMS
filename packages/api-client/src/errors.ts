// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** RFC 7807 Problem Details, as the BeechCMS API returns them on error. */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
}

/**
 * Failure of an API request, an OAuth exchange, or a connection attempt.
 *
 * `status` and `problem` are populated only for HTTP failures that carried a parseable body; callers
 * that need to branch on the failure (the CLI maps 401/403/409 to distinct remedies) read them, while
 * callers that only render text (the MCP server) keep using `message` unchanged.
 */
export class BeechClientError extends Error {
  constructor(message: string, readonly status?: number, readonly problem?: Partial<ProblemDetails>) {
    super(message)
    this.name = 'BeechClientError'
  }
}
