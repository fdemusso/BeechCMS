// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Process-wide API client for the MCP server.
 *
 * The transport, the OAuth flow and the grant cache live in `@beechcms/api-client`, shared with the
 * `beech` CLI: one credential path, one token store, one 401 policy. This module only fixes the
 * client identity (`beech-mcp`) and the singleton lifetime the stdio server needs.
 *
 * @module
 */

import { createApiClient, resolveApiConfig, type ApiResponse } from '@beechcms/api-client'

export { BeechClientError } from '@beechcms/api-client'
export type { ProblemDetails, ApiResponse } from '@beechcms/api-client'

const client = createApiClient(resolveApiConfig())

/** Sends an authenticated request to the BeechCMS API. See `@beechcms/api-client`. */
export function request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  return client.request<T>(method, path, body)
}
