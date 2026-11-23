// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Process-wide API client for the MCP server.
 *
 * The transport, the OAuth flow and the grant cache live in `@beechcms/api-client`, shared with the
 * `beech` CLI: one credential path, one token store, one 401 policy. This module fixes the client
 * identity (`beech-mcp`), the scopes the 2.0 tools need, and the singleton lifetime the stdio server needs.
 *
 * @module
 */

import { clearGrant, createApiClient, readGrant, resolveApiConfig, type ApiResponse } from '@beechcms/api-client'
import {
  MCP_OAUTH_CLIENT_ID,
  MCP_OAUTH_SCOPE,
  MCP_V2_MARKER_SCOPE,
  PENDING_ACTIONS_PATH,
  SCRIPT_OAUTH_CLIENT_ID,
} from './constants.js'

export { BeechClientError } from '@beechcms/api-client'
export type { ProblemDetails, ApiResponse } from '@beechcms/api-client'

const config = resolveApiConfig({
  clientId: MCP_OAUTH_CLIENT_ID,
  scope: process.env.BEECH_OAUTH_SCOPE ?? MCP_OAUTH_SCOPE,
})

dropLegacyGrant()

const client = createApiClient(config)

/**
 * Clears a cached grant that predates 2.0 (no `agent:read`), so the next call asks for the new scopes once.
 * Writes to stderr only: stdout is the stdio protocol channel.
 */
function dropLegacyGrant(): void {
  const requestedScopes = config.oauth.scope.split(/\s+/)
  if (!requestedScopes.includes(MCP_V2_MARKER_SCOPE)) return

  const cached = readGrant(config.baseUrl, config.oauth.clientId)
  if (!cached || cached.scope.split(/\s+/).includes(MCP_V2_MARKER_SCOPE)) return

  clearGrant(config.baseUrl, config.oauth.clientId)
  console.error('BeechCMS MCP 2.0 needs new permissions: your browser opens for consent on the next call.')
}

/** Sends an authenticated request to the BeechCMS API. See `@beechcms/api-client`. */
export function request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  return client.request<T>(method, path, body)
}

/** Raw authenticated request (ApiClient.send): final Response whatever its status. */
export function send(method: string, path: string, body?: unknown): Promise<Response> {
  return client.send(method, path, body)
}

/** `apiUrl` = client base URL; `pendingActionsUrl` = auth origin (BEECH_AUTH_URL ?? base URL) + PENDING_ACTIONS_PATH. */
export const apiUrls: { apiUrl: string; pendingActionsUrl: string } = {
  apiUrl: config.baseUrl,
  pendingActionsUrl: `${(config.oauth.authUrl ?? config.baseUrl).replace(/\/+$/, '')}${PENDING_ACTIONS_PATH}`,
}

/** Scopes of the cached `beech-mcp-cli` grant for this API, or null when scripts never authorized here. Reads the file on every call. */
export function scriptGrantScopes(): string[] | null {
  const cached = readGrant(config.baseUrl, SCRIPT_OAUTH_CLIENT_ID)
  return cached ? cached.scope.split(/\s+/).filter(Boolean) : null
}
